import { requireApiUser } from '@/lib/auth/admin';
import { canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { openingEmailSubject, latestComplianceReply } from '@/lib/kyb/caseMailThreads';
import { analyzeComplianceReplyAndDraftClientEmail, formatClientEmailDraft } from '@/lib/kyb/complianceReplyAgent';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;
  if (!canPerformKycOperations(user) && !canSubmitComplianceDecision(user)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

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

  const emailDraft = formatClientEmailDraft(openingEmailSubject(caseData), analysis.client_email_body);
  const updated = await updateCase(caseId, { emailDraft });

  return NextResponse.json({ case: updated, analysis, emailDraft });
}
