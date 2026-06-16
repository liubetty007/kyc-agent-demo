import { ingestDemoMailbox } from '@/lib/kyb/emailIngestion';
import { requireApiUser } from '@/lib/auth/admin';
import { appendMailboxMessage, customerEmail, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { getCase, updateCase, upsertReceivedDocument } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const summary = ingestDemoMailbox(caseData);
  let updated = caseData;
  for (const doc of summary.imported) {
    const next = await upsertReceivedDocument(caseId, doc);
    if (next) updated = next;
  }

  let mailboxMessages = updated.mailboxMessages || [];
  if (summary.imported.length) {
    mailboxMessages = appendMailboxMessage(updated, {
      from: customerEmail(updated),
      to: KYC_TEAM_EMAIL,
      subject: `KYB documents for ${updated.companyName}`,
      body: 'Please find attached the requested KYB documents for your review.',
      direction: 'inbound',
      status: 'received',
      attachments: summary.imported.map((doc) => doc.name),
    });
    updated = (await updateCase(caseId, { mailboxMessages })) || updated;
  }

  return NextResponse.json({ case: updated, summary });
}
