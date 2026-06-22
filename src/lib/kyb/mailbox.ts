import type { KYCCase, MailboxMessage } from './types';

export const KYC_TEAM_EMAIL = 'kyc-team@demo.antalpha.local';
export const COMPLIANCE_TEAM_EMAIL = 'liubetty007@gmail.com';

export function defaultComplianceEmail(caseData?: Pick<import('./types').KYCCase, 'complianceEmailTo'>): string {
  return caseData?.complianceEmailTo?.trim() || COMPLIANCE_TEAM_EMAIL;
}

export function customerEmail(caseData: KYCCase): string {
  return caseData.contactEmail || 'client@example.com';
}

export function appendMailboxMessage(caseData: KYCCase, message: Omit<MailboxMessage, 'id' | 'createdAt'>): MailboxMessage[] {
  const existing = caseData.mailboxMessages || [];
  if (message.providerMessageId && existing.some((item) => item.providerMessageId === message.providerMessageId)) {
    return existing;
  }
  return [
    ...existing,
    {
      ...message,
      id: `mail-${Date.now()}-${existing.length}`,
      createdAt: new Date().toISOString(),
    },
  ];
}
