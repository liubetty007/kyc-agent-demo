import { appendMailboxMessage, customerEmail, customerEmailRecipients, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { requireApiUser } from '@/lib/auth/admin';
import { readOpeningEmailAttachment, type OpeningEmailAttachmentRef } from '@/lib/kyb/documentStorage';
import { hasGmailConfigured, kycMailboxAddress, sendGmailMessage, splitEmailDraft } from '@/lib/kyb/gmail';
import { generateOpeningEmail } from '@/lib/kyb/openingEmail';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { isBackendEnabled, sendBackendOpeningEmailMock } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

function apiError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : fallback;
  const statusMatch = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  if (statusMatch) {
    const body = statusMatch[2].trim();
    try {
      const parsed = JSON.parse(body) as { detail?: string; error?: string };
      if (parsed.detail) return NextResponse.json({ error: parsed.detail }, { status: Number(statusMatch[1]) });
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: Number(statusMatch[1]) });
    } catch {
      if (body && body !== 'Internal Server Error') {
        return NextResponse.json({ error: body }, { status: Number(statusMatch[1]) });
      }
    }
  }
  const message = raw || fallback;
  const status = message.includes('404') ? 404 : message.includes('503') ? 503 : 502;
  return NextResponse.json({ error: message }, { status });
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

  if (body.action === 'send_demo') {
    try {
      if (isBackendEnabled()) {
        await sendBackendOpeningEmailMock(caseId);
        const draft = caseData.openingEmailDraft || generateOpeningEmail(caseData);
        const updated = await updateCase(caseId, {
          openingEmailDraft: draft,
          openingEmailSentAt: new Date().toISOString(),
        });
        return NextResponse.json(updated);
      }

      const draft = caseData.openingEmailDraft || generateOpeningEmail(caseData);
      const parsed = splitEmailDraft(draft, 'KYC Account Opening Documents');
      const updated = await updateCase(caseId, {
        openingEmailDraft: draft,
        openingEmailSentAt: new Date().toISOString(),
        mailboxMessages: appendMailboxMessage(caseData, {
          from: KYC_TEAM_EMAIL,
          to: customerEmailRecipients(caseData),
          subject: parsed.subject,
          body: parsed.body,
          direction: 'outbound',
          status: 'sent',
          attachments: ['Antalpha Institutional Cooperation Guide_XXX.pdf'],
        }),
      });
      return NextResponse.json(updated);
    } catch (error) {
      return apiError(error, 'Demo send failed.');
    }
  }

  if (body.action === 'send_real') {
    try {
      if (!hasGmailConfigured()) return NextResponse.json({ error: 'Gmail is not configured.' }, { status: 503 });
      const draft = caseData.openingEmailDraft || generateOpeningEmail(caseData);
      const parsed = splitEmailDraft(draft, 'KYC Account Opening Documents');
      const attachments = await Promise.all((body.attachments || []).map((attachment) => readOpeningEmailAttachment(caseId, attachment)));
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
