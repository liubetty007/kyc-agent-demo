import type { KYCCase } from './types';

type GmailHeader = { name: string; value: string };

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};

type GmailMessageResponse = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};

export type GmailAttachment = {
  filename: string;
  contentType?: string;
  data: Buffer;
};

export type GmailMessage = {
  id: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  snippet?: string;
  receivedAt: string;
  attachments: GmailAttachment[];
};

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function hasGmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

export function kycMailboxAddress(): string {
  return process.env.GMAIL_SENDER_EMAIL || process.env.KYC_TEAM_EMAIL || 'kyc-team@demo.antalpha.local';
}

function base64Url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(input?: string): string {
  if (!input) return '';
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function decodeBase64UrlBuffer(input?: string): Buffer {
  if (!input) return Buffer.alloc(0);
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function gmailAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || '',
      client_secret: process.env.GMAIL_CLIENT_SECRET || '',
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`Gmail OAuth failed: ${response.status}`);
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('Gmail OAuth did not return an access token.');
  return body.access_token;
}

async function gmailFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await gmailAccessToken();
  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Gmail API failed: ${response.status}`);
  return await response.json() as T;
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || '';
}

function walkParts(part: GmailPart | undefined, visitor: (part: GmailPart) => void) {
  if (!part) return;
  visitor(part);
  for (const child of part.parts || []) walkParts(child, visitor);
}

function textFromPayload(payload?: GmailPart): string {
  const bodies: string[] = [];
  walkParts(payload, (part) => {
    if (part.mimeType === 'text/plain' && part.body?.data) bodies.push(decodeBase64Url(part.body.data));
  });
  if (bodies.length) return bodies.join('\n\n').trim();
  walkParts(payload, (part) => {
    if (part.mimeType === 'text/html' && part.body?.data) {
      bodies.push(decodeBase64Url(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
  });
  return bodies.join('\n\n').trim();
}

async function attachmentsFromPayload(messageId: string, payload?: GmailPart): Promise<GmailAttachment[]> {
  const attachments: GmailAttachment[] = [];
  const jobs: Array<Promise<void>> = [];
  walkParts(payload, (part) => {
    if (!part.filename || !part.body?.attachmentId) return;
    jobs.push((async () => {
      const attachment = await gmailFetch<{ data?: string }>(`/messages/${messageId}/attachments/${part.body?.attachmentId}`);
      attachments.push({
        filename: part.filename || 'attachment',
        contentType: part.mimeType,
        data: decodeBase64UrlBuffer(attachment.data),
      });
    })());
  });
  await Promise.all(jobs);
  return attachments;
}

async function getGmailMessage(messageId: string): Promise<GmailMessage> {
  const message = await gmailFetch<GmailMessageResponse>(`/messages/${messageId}?format=full`);
  return {
    id: message.id,
    threadId: message.threadId,
    from: header(message.payload, 'From'),
    to: header(message.payload, 'To'),
    subject: header(message.payload, 'Subject'),
    body: textFromPayload(message.payload) || message.snippet || '',
    snippet: message.snippet,
    receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString(),
    attachments: await attachmentsFromPayload(message.id, message.payload),
  };
}

export async function listCaseGmailMessages(caseData: KYCCase): Promise<GmailMessage[]> {
  const sender = caseData.contactEmail ? `from:${caseData.contactEmail}` : '';
  const query = [
    sender,
    `("${caseData.id}" OR "${caseData.companyName}")`,
    'newer_than:45d',
  ].filter(Boolean).join(' ');
  const listed = await gmailFetch<{ messages?: Array<{ id: string }> }>(`/messages?q=${encodeURIComponent(query)}&maxResults=10`);
  const messages = await Promise.all((listed.messages || []).map((item) => getGmailMessage(item.id)));
  return messages.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

export async function sendGmailMessage(input: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<{ id: string; threadId?: string }> {
  const from = kycMailboxAddress();
  const raw = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    input.body,
  ].join('\r\n');
  return await gmailFetch('/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: base64Url(raw), threadId: input.threadId }),
  });
}

export function splitEmailDraft(draft: string, fallbackSubject: string): { subject: string; body: string } {
  const lines = draft.split(/\r?\n/);
  const first = lines[0]?.trim() || '';
  if (/^subject:/i.test(first)) {
    return { subject: first.replace(/^subject:\s*/i, '').trim() || fallbackSubject, body: lines.slice(1).join('\n').trim() };
  }
  return { subject: fallbackSubject, body: draft.trim() };
}
