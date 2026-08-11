import { appendMailboxMessage, customerEmailRecipients } from '@/lib/kyb/mailbox';
import { requireApiUser } from '@/lib/auth/admin';
import { readOpeningEmailAttachment, type OpeningEmailAttachmentRef } from '@/lib/kyb/documentStorage';
import { hasGmailConfigured, kycMailboxAddress, sendGmailMessage, splitEmailDraft } from '@/lib/kyb/gmail';
import { generateOpeningEmail } from '@/lib/kyb/openingEmail';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { ensureCaseDriveFolder } from '@/lib/kyb/driveFolders';
import { NextResponse } from 'next/server';
import { safeUpstreamErrorResponse } from '@/lib/api/errorResponse';

function apiError(error: unknown, fallback: string) {
  return safeUpstreamErrorResponse('Opening email operation failed', error, fallback);
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  let body: { action?: string; attachments?: OpeningEmailAttachmentRef[] } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.action === 'regenerate') {
    const openingEmailDraft = generateOpeningEmail(caseData);
    const updated = await updateCase(caseId, { openingEmailDraft });
    return NextResponse.json(updated);
  }

  if (body.action === 'send_real') {
    try {
      if (!hasGmailConfigured()) return NextResponse.json({ error: 'Gmail is not configured.' }, { status: 503 });
      const draft = caseData.openingEmailDraft || generateOpeningEmail(caseData);
      const parsed = splitEmailDraft(draft, 'KYC Account Opening Documents');
      const caseDriveFolderId = await ensureCaseDriveFolder(caseId);
      const attachments = await Promise.all((body.attachments || []).map(
        (attachment) => readOpeningEmailAttachment(caseId, attachment, caseDriveFolderId),
      ));
      const recipients = customerEmailRecipients(caseData);
      const sent = await sendGmailMessage({
        to: recipients,
        subject: parsed.subject,
        body: parsed.body,
        attachments,
      });
      const updated = await updateCase(caseId, {
        openingEmailDraft: draft,
        openingEmailSentAt: new Date().toISOString(),
        mailboxMessages: appendMailboxMessage(caseData, {
          provider: 'gmail',
          providerMessageId: sent.id,
          threadId: sent.threadId,
          from: kycMailboxAddress(),
          to: recipients,
          subject: parsed.subject,
          body: parsed.body,
          direction: 'outbound',
          status: 'sent',
          attachments: attachments.map((attachment) => attachment.filename),
        }),
      });
      return NextResponse.json({ ...updated, attachments_sent: attachments.length, recipients });
    } catch (error) {
      return apiError(error, 'Gmail send failed.');
    }
  }

  const updated = await updateCase(caseId, {
    openingEmailDraft: caseData.openingEmailDraft || generateOpeningEmail(caseData),
  });
  return NextResponse.json(updated);
}
