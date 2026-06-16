import { generateComplianceEmail } from '@/lib/kyb/complianceEmail';
import { requireApiUser } from '@/lib/auth/admin';
import { appendMailboxMessage, COMPLIANCE_TEAM_EMAIL, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { runReview } from '@/lib/kyb/review';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const review = caseData.review || runReview(caseData);
  const draft = caseData.complianceEmailDraft || generateComplianceEmail(caseData, review);

  if (body.action === 'send_demo') {
    const updated = await updateCase(caseId, {
      review,
      complianceEmailDraft: draft,
      complianceEmailSentAt: new Date().toISOString(),
      mailboxMessages: appendMailboxMessage(caseData, {
        from: KYC_TEAM_EMAIL,
        to: COMPLIANCE_TEAM_EMAIL,
        subject: `Compliance Review Request – ${caseData.companyName} (${caseData.id})`,
        body: draft,
        direction: 'internal',
        status: 'sent',
        attachments: ['Compliance Pack', 'Case Documents'],
      }),
    });
    return NextResponse.json(updated);
  }

  const updated = await updateCase(caseId, { review, complianceEmailDraft: draft });
  return NextResponse.json(updated);
}
