import { COMPLIANCE_TEAM_EMAIL, customerEmail, KYC_TEAM_EMAIL } from './mailbox';
import type { KYCCase } from './types';

function normalizeEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

export function isComplianceSender(from: string): boolean {
  const email = normalizeEmail(from);
  return email.includes('liubetty007') || email === COMPLIANCE_TEAM_EMAIL.toLowerCase();
}

function isKycSender(from: string): boolean {
  const email = normalizeEmail(from);
  if (email.includes('kyc-team') || email.includes('demo.antalpha')) return true;
  const sender = (process.env.GMAIL_SENDER_EMAIL || '').toLowerCase();
  return Boolean(sender && email === sender);
}

export function openingThreadId(caseData: KYCCase): string | undefined {
  const messages = caseData.mailboxMessages || [];
  const opening = [...messages]
    .reverse()
    .find(
      (message) =>
        message.direction === 'outbound'
        && message.status === 'sent'
        && message.provider === 'gmail'
        && message.to.toLowerCase().includes(customerEmail(caseData).toLowerCase().split('@')[0]),
    );
  return opening?.threadId || messages.find((message) => message.threadId && message.direction === 'outbound')?.threadId;
}

export function complianceThreadId(caseData: KYCCase): string | undefined {
  return (
    caseData.complianceGmailThreadId
    || (caseData.mailboxMessages || [])
      .find((message) => message.direction === 'outbound' && message.to === COMPLIANCE_TEAM_EMAIL && message.threadId)
      ?.threadId
  );
}

export function complianceReplyMessages(caseData: KYCCase) {
  const threadId = complianceThreadId(caseData);
  const outbound = complianceOutboundMessages(caseData);
  const outboundIds = new Set(
    outbound.map((message) => message.providerMessageId).filter(Boolean),
  );
  const outboundBodies = new Set(outbound.map((message) => message.body.trim()).filter(Boolean));

  return (caseData.mailboxMessages || []).filter((message) => {
    if (message.direction !== 'inbound') return false;
    if (threadId && message.threadId && message.threadId !== threadId) return false;
    if (isKycSender(message.from)) return false;
    if (!isComplianceSender(message.from)) return false;
    if (message.providerMessageId && outboundIds.has(message.providerMessageId)) return false;
    const body = message.body.trim();
    if (body && outboundBodies.has(body)) return false;
    return true;
  });
}

export function latestComplianceReply(caseData: KYCCase) {
  const replies = complianceReplyMessages(caseData);
  return replies.length ? replies[replies.length - 1] : undefined;
}

export function complianceOutboundMessages(caseData: KYCCase) {
  return (caseData.mailboxMessages || []).filter(
    (message) => message.direction === 'outbound' && message.to === COMPLIANCE_TEAM_EMAIL,
  );
}

export function kycSenderAddress(): string {
  return process.env.GMAIL_SENDER_EMAIL || KYC_TEAM_EMAIL;
}
