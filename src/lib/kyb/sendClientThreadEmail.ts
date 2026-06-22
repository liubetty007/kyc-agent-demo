import { openingEmailSubject, openingThreadId } from './caseMailThreads';
import { hasGmailConfigured, kycMailboxAddress, sendGmailMessage, splitEmailDraft, type GmailAttachment } from './gmail';
import { customerEmail, KYC_TEAM_EMAIL } from './mailbox';
import type { KYCCase } from './types';
import { isBackendEnabled, sendBackendClientFollowUpEmail } from '@/lib/kyc-backend/client';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

export type ClientThreadEmailSent = {
  subject: string;
  body: string;
  provider: 'gmail';
  providerMessageId: string;
  threadId?: string;
  from: string;
  to: string;
};

export async function sendClientThreadEmail(
  caseId: string,
  caseData: KYCCase,
  draft: string,
  attachments: GmailAttachment[] = [],
): Promise<ClientThreadEmailSent> {
  const parsed = splitEmailDraft(draft, openingEmailSubject(caseData));
  const threadId = openingThreadId(caseData);

  if (isBackendEnabled() && isBackendCaseId(caseId)) {
    const sent = await sendBackendClientFollowUpEmail(caseId, {
      subject: parsed.subject,
      body_text: parsed.body,
    });
    return {
      subject: sent.subject,
      body: parsed.body,
      provider: 'gmail',
      providerMessageId: sent.gmail_message_id,
      threadId: sent.gmail_thread_id || threadId,
      from: kycMailboxAddress() || KYC_TEAM_EMAIL,
      to: customerEmail(caseData),
    };
  }

  if (!threadId && !caseData.openingEmailSentAt) {
    throw new Error('未找到开户邮件线程。请先通过 Gmail 发送开户邮件。');
  }
  if (!hasGmailConfigured()) {
    throw new Error('Gmail is not configured.');
  }

  const sent = await sendGmailMessage({
    to: customerEmail(caseData),
    subject: parsed.subject,
    body: parsed.body,
    threadId,
    attachments,
  });

  return {
    subject: parsed.subject,
    body: parsed.body,
    provider: 'gmail',
    providerMessageId: sent.id,
    threadId: sent.threadId || threadId,
    from: kycMailboxAddress(),
    to: customerEmail(caseData),
  };
}
