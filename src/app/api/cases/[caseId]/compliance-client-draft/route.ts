import { requireApiUser } from '@/lib/auth/admin';
import { analyzeComplianceReplyAndDraftClientEmail, formatClientEmailDraft } from '@/lib/kyb/complianceReplyAgent';
import { latestComplianceReply } from '@/lib/kyb/caseMailThreads';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { formatComplianceNote } from '@/lib/kyb/complianceReview';
import type { ComplianceDecisionOutcome } from '@/lib/kyb/types';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const reply = latestComplianceReply(caseData);
  if (!reply) {
    return NextResponse.json({ error: '请先抓取合规回复邮件。' }, { status: 400 });
  }

  const analysis = await analyzeComplianceReplyAndDraftClientEmail(caseData, {
    subject: reply.subject,
    body: reply.body,
    from: reply.from,
  });

  const emailDraft = formatClientEmailDraft(analysis.client_email_subject, analysis.client_email_body);
  const outcome = analysis.outcome === 'unclear' ? 'request_more_info' : analysis.outcome;

  const updated = await updateCase(caseId, {
    emailDraft,
    complianceDecisions: [
      ...(caseData.complianceDecisions || []),
      {
        outcome: outcome as ComplianceDecisionOutcome,
        note: formatComplianceNote(`[LLM 解析合规邮件]\n${analysis.summary}`, reply.from),
        reviewerEmail: reply.from,
        decidedAt: reply.createdAt,
      },
    ],
    status: outcome === 'approved' ? 'approved' : outcome === 'rejected' ? 'rejected' : 'awaiting_client_information',
  });

  return NextResponse.json({ case: updated, analysis, emailDraft });
}
