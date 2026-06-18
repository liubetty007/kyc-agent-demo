import { requireApiUser } from '@/lib/auth/admin';
import { canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { formatComplianceNote, statusAfterComplianceDecision } from '@/lib/kyb/complianceReview';
import { appendMailboxMessage, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { getCase, updateCase } from '@/lib/kyb/storage';
import type { ComplianceDecisionOutcome } from '@/lib/kyb/types';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;

  const isKycManual = canPerformKycOperations(user);
  if (!isKycManual && !canSubmitComplianceDecision(user)) {
    return NextResponse.json({ error: 'Not authorized to submit compliance decisions.' }, { status: 403 });
  }

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

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

  const decision = {
    outcome,
    note: formatComplianceNote(rawNote, user.email),
    reviewerEmail: user.email,
    decidedAt: new Date().toISOString(),
  };

  const mailboxMessages = appendMailboxMessage(caseData, {
    from: user.email,
    to: KYC_TEAM_EMAIL,
    subject: `Compliance decision – ${caseData.companyName} (${outcome})`,
    body: decision.note,
    direction: 'internal',
    status: 'received',
  });

  const updated = await updateCase(caseId, {
    status: statusAfterComplianceDecision(outcome),
    complianceDecisions: [...(caseData.complianceDecisions || []), decision],
    mailboxMessages,
  });

  return NextResponse.json(updated);
}
