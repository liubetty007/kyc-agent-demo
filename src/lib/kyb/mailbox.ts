import type { KYCCase, MailboxMessage } from './types';

export const KYC_TEAM_EMAIL = 'kyc-team@demo.antalpha.local';
export const COMPLIANCE_TEAM_EMAIL = 'compliance-team@demo.antalpha.local';

export function customerEmail(caseData: KYCCase): string {
  return caseData.contactEmail || 'client@example.com';
}

export function appendMailboxMessage(caseData: KYCCase, message: Omit<MailboxMessage, 'id' | 'createdAt'>): MailboxMessage[] {
  return [
    ...(caseData.mailboxMessages || []),
    {
      ...message,
      id: `mail-${Date.now()}-${(caseData.mailboxMessages || []).length}`,
      createdAt: new Date().toISOString(),
    },
  ];
}
