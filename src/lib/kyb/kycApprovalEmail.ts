import { openingEmailSubject } from './caseMailThreads';
import type { KYCCase } from './types';

export function buildKycApprovalEmailDraft(caseData: KYCCase): string {
  const subject = openingEmailSubject(caseData);
  const body = [
    `Dear ${caseData.companyName} Team,`,
    '',
    'Congratulations! We are pleased to inform you that your KYC / account opening review has been approved.',
    '',
    'Our compliance team has completed the review, and your application may now proceed to the next onboarding steps. We will contact you separately if any further action is required.',
    '',
    'Thank you for your cooperation throughout this process.',
    '',
    'Best regards,',
    'KYC Team',
  ].join('\n');

  return `Subject: ${subject}\n\n${body}`;
}
