import type { BackendCaseSummary } from './client';
import type { BusinessType, CaseLanguage, Jurisdiction, KYCCase } from '@/lib/kyb/types';

const JURISDICTION_TO_COUNTRY: Record<Jurisdiction, string> = {
  'Hong Kong': 'Hong Kong',
  Singapore: 'Singapore',
  BVI: 'BVI',
  Cayman: 'Cayman',
  'United States': 'United States',
  'European countries': 'European countries',
  'Other offshore': 'BVI',
  'Other countries': 'Other countries',
  'Mainland China': 'Mainland China',
};

const BUSINESS_TAGS: Record<BusinessType, string[]> = {
  btc_loan: ['btc_loan'],
  mining_loan: [],
  normal: [],
  crypto: ['crypto'],
  mining: ['mining'],
  financing: ['financing'],
  crypto_financing: ['crypto', 'financing', 'btc_loan'],
  other: [],
};

function primaryContactEmail(value?: string): string {
  return value
    ?.split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .find((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || 'client@example.com';
}

export function toBackendIntake(input: {
  companyName: string;
  contactEmail?: string;
  jurisdiction: Jurisdiction;
  usState?: string;
  businessType: BusinessType;
  sourceOfFunds: string;
  needsNsBusiness?: boolean;
  language?: CaseLanguage;
}) {
  const registrationCountry = JURISDICTION_TO_COUNTRY[input.jurisdiction] || input.jurisdiction;
  const businessDescription = [input.sourceOfFunds, input.usState ? `US State: ${input.usState}` : '']
    .filter(Boolean)
    .join('\n');

  const needsNs = Boolean(input.needsNsBusiness);
  const language = input.language || 'zh';
  const tags = [...(BUSINESS_TAGS[input.businessType] || [])];

  return {
    customer_type: 'corporate' as const,
    customer_name: input.companyName,
    registration_country: registrationCountry,
    business_description: businessDescription,
    ubo_residence_country: registrationCountry,
    contact_email: primaryContactEmail(input.contactEmail),
    language,
    needs_ns: needsNs,
    tags,
    attributes: {},
  };
}

export function backendCaseToKycCase(
  backend: BackendCaseSummary,
  input: {
    companyName: string;
    contactEmail?: string;
    jurisdiction: Jurisdiction;
    usState?: string;
    businessType: BusinessType;
    sourceOfFunds: string;
    needsNsBusiness?: boolean;
    language?: CaseLanguage;
  },
): KYCCase {
  const now = new Date().toISOString();
  const draft = `Subject: ${backend.email.subject}\n\n${backend.email.body_text}`;

  return {
    id: backend.case_id,
    companyName: input.companyName,
    contactEmail: input.contactEmail,
    jurisdiction: input.jurisdiction,
    usState: input.usState,
    businessType: input.businessType,
    sourceOfFunds: input.sourceOfFunds,
    language: input.language,
    needsNsBusiness: input.needsNsBusiness,
    status: 'checklist_generated',
    createdAt: now,
    updatedAt: now,
    individuals: [
      { id: 'director-1', name: 'Primary Director', role: 'director' },
      { id: 'ubo-1', name: 'Main UBO', role: 'ubo', ownershipPercentage: 25 },
    ],
    receivedDocuments: [],
    openingEmailDraft: draft,
    driveFolderId: backend.drive_folder_id || undefined,
    checklist: backend.selection.required_doc_types.map((docType) => ({
      id: docType,
      name: docType.replaceAll('_', ' '),
      category: 'required',
      required: true,
      reason: backend.selection.package_name,
    })),
  };
}
