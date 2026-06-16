import type { KYCCase } from './types';

const GUIDE_ATTACHMENT = 'Antalpha Institutional Cooperation Guide_XXX.pdf';

export function generateOpeningEmail(caseData: KYCCase): string {
  return `Subject: Antalpha Institutional Cooperation Guide and Account Opening Documents

Dear ${caseData.companyName} Team,

Thank you for your interest in institutional cooperation with Antalpha.

To start the corporate account opening and KYB review process, please review the attached Antalpha Institutional Cooperation Guide and provide the required onboarding documents listed in the guide.

Attachment: ${GUIDE_ATTACHMENT}

For the initial review, please share the available corporate documents, authorized signatory information, UBO/director identification documents, proof of address, and source of funds / source of assets evidence where applicable. Additional documents may be requested based on jurisdiction, business model, and compliance review requirements.

Once we receive the documents, our KYC Team will review the submission and follow up if any information is missing or requires clarification.

Best regards,
KYC Team`;
}

export { GUIDE_ATTACHMENT };
