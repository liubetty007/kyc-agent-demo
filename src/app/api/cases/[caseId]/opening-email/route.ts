import { appendMailboxMessage, customerEmail, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { requireApiUser } from '@/lib/auth/admin';
import { generateOpeningEmail } from '@/lib/kyb/openingEmail';
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

  if (body.action === 'send_demo') {
    const draft = caseData.openingEmailDraft || generateOpeningEmail(caseData);
    const updated = await updateCase(caseId, {
      openingEmailDraft: draft,
      openingEmailSentAt: new Date().toISOString(),
      mailboxMessages: appendMailboxMessage(caseData, {
        from: KYC_TEAM_EMAIL,
        to: customerEmail(caseData),
        subject: 'Antalpha Institutional Cooperation Guide and Account Opening Documents',
        body: draft,
        direction: 'outbound',
        status: 'sent',
        attachments: ['Antalpha Institutional Cooperation Guide_XXX.pdf'],
      }),
    });
    return NextResponse.json(updated);
  }

  const updated = await updateCase(caseId, {
    openingEmailDraft: caseData.openingEmailDraft || generateOpeningEmail(caseData),
  });
  return NextResponse.json(updated);
}
