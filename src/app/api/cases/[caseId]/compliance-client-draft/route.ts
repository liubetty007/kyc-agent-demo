import { requireApiUser } from '@/lib/auth/admin';
import { canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { openingEmailSubject } from '@/lib/kyb/caseMailThreads';
import { analyzeComplianceReplyAndDraftClientEmail, formatClientEmailDraft } from '@/lib/kyb/complianceReplyAgent';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';
import { feedbackAfterCurrentSubmission } from '@/lib/kyb/complianceWorkflow';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  if (!canPerformKycOperations(user)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const feedback = feedbackAfterCurrentSubmission(caseData);
  if (!feedback) {
    return NextResponse.json({ error: '请先取得当前审核轮次的合规回复。' }, { status: 400 });
  }
  if (feedback.outcome !== 'request_more_info' && feedback.outcome !== 'edd_required') {
    return NextResponse.json({ error: '当前合规回复未要求客户补件或 EDD。' }, { status: 409 });
  }

  const analysis = await analyzeComplianceReplyAndDraftClientEmail(caseData, {
    subject: feedback.subject,
    body: feedback.note,
    from: feedback.from,
  });

  const emailDraft = formatClientEmailDraft(openingEmailSubject(caseData), analysis.client_email_body);
  const updated = await updateCase(caseId, { emailDraft });

  return NextResponse.json({ case: updated, analysis, emailDraft });
}
