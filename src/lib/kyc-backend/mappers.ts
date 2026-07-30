import type { BackendCaseSummary } from './client';
import { generateChecklist } from '@/lib/kyb/checklist';
import type {
  BusinessType,
  CaseLanguage,
  CustomerType,
  EntityType,
  Jurisdiction,
  KYCCase,
  RiskRating,
} from '@/lib/kyb/types';

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
  customerType?: CustomerType;
  entityType?: EntityType;
  riskRating?: RiskRating;
  isFinancialInstitution?: boolean;
  managesClientAssets?: boolean;
  isListedEntity?: boolean;
  isLicensedEntity?: boolean;
  passportCtcProvided?: boolean;
  hasThirdPartyFunding?: boolean;
  legalExceptionApproved?: boolean;
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
    attributes: {
      customer_type: input.customerType || 'new_customer',
      entity_type: input.entityType || 'limited_company',
      risk_rating: input.riskRating || 'medium',
      is_financial_institution: Boolean(input.isFinancialInstitution),
      manages_client_assets: Boolean(input.managesClientAssets),
      is_listed_entity: Boolean(input.isListedEntity),
      is_licensed_entity: Boolean(input.isLicensedEntity),
      passport_ctc_provided: Boolean(input.passportCtcProvided),
      has_third_party_funding: Boolean(input.hasThirdPartyFunding),
      legal_exception_approved: Boolean(input.legalExceptionApproved),
    },
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
    customerType?: CustomerType;
    entityType?: EntityType;
    riskRating?: RiskRating;
    isFinancialInstitution?: boolean;
    managesClientAssets?: boolean;
    isListedEntity?: boolean;
    isLicensedEntity?: boolean;
    passportCtcProvided?: boolean;
    hasThirdPartyFunding?: boolean;
    legalExceptionApproved?: boolean;
    needsNsBusiness?: boolean;
    language?: CaseLanguage;
  },
): KYCCase {
  const now = new Date().toISOString();
  const draft = `Subject: ${backend.email.subject}\n\n${backend.email.body_text}`;
  const caseData: KYCCase = {
    id: backend.case_id,
    companyName: input.companyName,
    contactEmail: input.contactEmail,
    jurisdiction: input.jurisdiction,
    usState: input.usState,
    businessType: input.businessType,
    sourceOfFunds: input.sourceOfFunds,
    customerType: input.customerType || 'new_customer',
    entityType: input.entityType || 'limited_company',
    riskRating: input.riskRating || 'medium',
    isFinancialInstitution: input.isFinancialInstitution,
    managesClientAssets: input.managesClientAssets,
    isListedEntity: input.isListedEntity,
    isLicensedEntity: input.isLicensedEntity,
    passportCtcProvided: input.passportCtcProvided,
    hasThirdPartyFunding: input.hasThirdPartyFunding,
    legalExceptionApproved: input.legalExceptionApproved,
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
  };
  return { ...caseData, checklist: generateChecklist(caseData) };
}
