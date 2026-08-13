import { requireApiUser } from '@/lib/auth/admin';
import { canSubmitComplianceDecision } from '@/lib/auth/roles';
import { buildKycApprovalEmailDraft } from '@/lib/kyb/kycApprovalEmail';
import { formatComplianceNote, statusAfterComplianceDecision } from '@/lib/kyb/complianceReview';
import { appendMailboxMessage, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { sendClientThreadEmail } from '@/lib/kyb/sendClientThreadEmail';
import { getCase, updateCase } from '@/lib/kyb/storage';
import type { ComplianceDecisionOutcome, KYCCase } from '@/lib/kyb/types';
import { NextResponse } from 'next/server';
import {
  canFinalizeCurrentRound,
  currentComplianceRound,
  updateCurrentComplianceRound,
} from '@/lib/kyb/complianceWorkflow';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;

  if (!canSubmitComplianceDecision(user)) {
    return NextResponse.json({ error: 'Not authorized to submit compliance decisions.' }, { status: 403 });
  }

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  if (caseData.status === 'approved' || caseData.status === 'rejected') {
    return NextResponse.json({ error: '该案件已有最终审批结果。' }, { status: 400 });
  }

  let body: { outcome?: ComplianceDecisionOutcome; note?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const outcome = body.outcome;
  let rawNote = (body.note || '').trim();
  if (!outcome || !['approved', 'rejected', 'request_more_info', 'edd_required'].includes(outcome)) {
    return NextResponse.json({ error: 'Invalid compliance outcome.' }, { status: 400 });
  }
  if (!rawNote) {
    rawNote = outcome === 'approved'
      ? '人工确认：已完成合规要求，通过。'
      : outcome === 'rejected'
        ? '人工确认：不通过。'
        : '人工记录合规意见。';
  }

  if (!canFinalizeCurrentRound(caseData)) {
    return NextResponse.json({
      error: '只能对当前已发送且正在合规审核中的轮次提交审批。补件后请先由 KYC 重新送审。',
    }, { status: 409 });
  }

  const currentRound = currentComplianceRound(caseData)!;

  const decision = {
    outcome,
    note: formatComplianceNote(rawNote, user.email),
    reviewerEmail: user.email,
    decidedAt: new Date().toISOString(),
    round: currentRound.round,
  };

  const approvalDraft = outcome === 'approved' ? buildKycApprovalEmailDraft(caseData) : undefined;
  const mailboxMessages = appendMailboxMessage(caseData, {
    from: user.email,
    to: KYC_TEAM_EMAIL,
    subject: `Compliance decision – ${caseData.companyName} (${outcome})`,
    body: decision.note,
    direction: 'internal',
    status: 'received',
  });

  let updated = await updateCase(caseId, {
    status: statusAfterComplianceDecision(outcome),
    emailDraft: approvalDraft || caseData.emailDraft,
    complianceDecisions: [...(caseData.complianceDecisions || []), decision],
    complianceReviewRounds: updateCurrentComplianceRound(caseData, {
      status: outcome === 'approved'
        ? 'approved'
        : outcome === 'rejected'
          ? 'rejected'
          : 'changes_requested',
      feedbackAt: decision.decidedAt,
      feedbackOutcome: outcome,
    }),
    mailboxMessages,
  });

  if (!updated) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  let clientEmailSent = false;
  let clientEmailError: string | undefined;
  if (outcome === 'approved' && approvalDraft) {
    try {
      const sent = await sendClientThreadEmail(caseId, updated, approvalDraft);
      const sentAt = new Date().toISOString();
      updated = (await updateCase(caseId, {
        clientApprovalEmailSentAt: sentAt,
        clientApprovalEmailError: undefined,
        mailboxMessages: appendMailboxMessage(updated, {
          provider: sent.provider,
          providerMessageId: sent.providerMessageId,
          threadId: sent.threadId,
          from: sent.from,
          to: sent.to,
          subject: sent.subject,
          body: sent.body,
          direction: 'outbound',
          status: 'sent',
        }),
      })) || updated;
      clientEmailSent = true;
    } catch {
      clientEmailError = '合规审批已保存，但向客户发送开户成功邮件失败，请在客户邮件线程中人工补发。';
      updated = (await updateCase(caseId, { clientApprovalEmailError: clientEmailError })) || updated;
    }
  }

  return NextResponse.json({ ...updated, clientEmailSent, clientEmailError });
}
