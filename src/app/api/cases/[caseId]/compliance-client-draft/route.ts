import { requireApiUser } from '@/lib/auth/admin';
import { analyzeComplianceReplyAndDraftClientEmail, formatClientEmailDraft } from '@/lib/kyb/complianceReplyAgent';
import { latestComplianceReply } from '@/lib/kyb/caseMailThreads';
import { formatComplianceNote, statusAfterComplianceDecision } from '@/lib/kyb/complianceReview';
import { outcomeForAutomaticComplianceHandling } from '@/lib/kyb/complianceOutcome';
import { getCase, updateCase } from '@/lib/kyb/storage';
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
  const outcome = outcomeForAutomaticComplianceHandling(analysis.outcome, reply.body);

  const updated = await updateCase(caseId, {
    emailDraft,
    complianceDecisions: [
      ...(caseData.complianceDecisions || []),
      {
        outcome,
        note: formatComplianceNote(`[LLM 解析合规邮件]\n${analysis.summary}`, reply.from),
        reviewerEmail: reply.from,
        decidedAt: reply.createdAt,
      },
    ],
    status: statusAfterComplianceDecision(outcome),
  });

  return NextResponse.json({ case: updated, analysis, emailDraft });
}
