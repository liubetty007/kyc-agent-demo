import type { KYCCase } from './types';

export const TEMPLATE_DOC_TYPES: Record<string, string[]> = {
  'authorization_letter.pdf': ['authorization_letter'],
  'institution_kyc_application_form.pdf': ['institution_onboarding_form'],
  'board_resolution.pdf': ['board_resolution'],
  'mutual_confidentiality_agreement_nda.pdf': ['nda_mutual_confidentiality_agreement'],
  'source_of_funds_template.pdf': ['source_of_funds', 'source_of_fund_wealth_declaration'],
  'board_resolution_ns.pdf': ['board_resolution'],
  'mutual_confidentiality_agreement_nda_ns.pdf': ['nda_mutual_confidentiality_agreement'],
  'non_us_person_non_solicitation_hk.pdf': ['non_us_person_non_solicitation_confirmation'],
};

export const PRIME_OPENING_ATTACHMENT_IDS = [
  'authorization_letter.pdf',
  'institution_kyc_application_form.pdf',
  'board_resolution.pdf',
  'mutual_confidentiality_agreement_nda.pdf',
  'source_of_funds_template.pdf',
] as const;

export const BTC_LOAN_ATTACHMENT_IDS = ['non_us_person_non_solicitation_hk.pdf'] as const;

const NS_ATTACHMENT_IDS = [
  'board_resolution_ns.pdf',
  'mutual_confidentiality_agreement_nda_ns.pdf',
] as const;

function isBtcLoanCase(caseData: KYCCase): boolean {
  return caseData.businessType === 'btc_loan' || caseData.businessType === 'crypto_financing';
}

export function openingPackageAttachmentIds(caseData: KYCCase): string[] {
  const ids: string[] = [...PRIME_OPENING_ATTACHMENT_IDS];
  if (isBtcLoanCase(caseData)) {
    for (const templateId of BTC_LOAN_ATTACHMENT_IDS) {
      if (!ids.includes(templateId)) ids.push(templateId);
    }
  }
  if (caseData.needsNsBusiness) {
    for (const templateId of NS_ATTACHMENT_IDS) {
      if (!ids.includes(templateId)) ids.push(templateId);
    }
  }
  return ids;
}

function shouldIncludeTemplate(mapped: string[], accepted: Set<string>, rejected: Set<string>): boolean {
  if (!mapped.length) return true;
  return mapped.some((docType) => rejected.has(docType) || !accepted.has(docType));
}

function selectOpeningTemplatesExcludingAccepted(
  candidateIds: string[],
  acceptedDocTypes: string[],
  rejectedDocTypes: string[],
  needsNs: boolean,
): string[] {
  const accepted = new Set(acceptedDocTypes);
  const rejected = new Set(rejectedDocTypes);
  const selected: string[] = [];

  for (const templateId of candidateIds) {
    const mapped = TEMPLATE_DOC_TYPES[templateId] || [];
    if (!shouldIncludeTemplate(mapped, accepted, rejected)) continue;

    if (needsNs && !templateId.endsWith('_ns.pdf')) {
      const nsId = templateId.replace('.pdf', '_ns.pdf');
      if (candidateIds.includes(nsId)) continue;
    }
    if (!needsNs && templateId.endsWith('_ns.pdf')) {
      const baseId = templateId.replace('_ns.pdf', '.pdf');
      if (candidateIds.includes(baseId)) continue;
    }

    selected.push(templateId);
  }

  return selected;
}

/** Opening-email templates except those already accepted (rejected types still included). */
export function followUpTemplateIdsForMissingDocs(
  caseData: KYCCase,
  input: {
    neededDocTypes: string[];
    acceptedDocTypes: string[];
    rejectedDocTypes?: string[];
  },
): string[] {
  if (!input.neededDocTypes.filter(Boolean).length) return [];

  const rejectedDocTypes = input.rejectedDocTypes || input.neededDocTypes.filter((docType) =>
    !(input.acceptedDocTypes || []).includes(docType),
  );

  return selectOpeningTemplatesExcludingAccepted(
    openingPackageAttachmentIds(caseData),
    input.acceptedDocTypes,
    rejectedDocTypes,
    Boolean(caseData.needsNsBusiness),
  );
}

export function followUpAttachmentNote(templateIds: string[]): string {
  if (!templateIds.length) return '';
  return `Please find attached the onboarding templates still required (same as our opening email, excluding documents already accepted): ${templateIds.join(', ')}`;
}
