import type {
  AssociatedIndividual,
  BusinessType,
  CaseLanguage,
  CustomerType,
  EntityType,
  Jurisdiction,
  KYCCase,
  RiskRating,
} from './types';

const JURISDICTIONS = new Set<Jurisdiction>([
  'Hong Kong', 'Singapore', 'BVI', 'Cayman', 'United States',
  'European countries', 'Other offshore', 'Other countries', 'Mainland China',
]);
const BUSINESS_TYPES = new Set<BusinessType>(['btc_loan', 'mining_loan', 'normal', 'crypto', 'mining', 'financing', 'crypto_financing', 'other']);
const CUSTOMER_TYPES = new Set<CustomerType>(['new_customer', 'new_counterparty']);
const ENTITY_TYPES = new Set<EntityType>(['limited_company', 'llc', 'corporation', 'limited_partnership', 'trust', 'spc_fund', 'other']);
const RISK_RATINGS = new Set<RiskRating>(['low', 'medium', 'high']);
const LANGUAGES = new Set<CaseLanguage>(['zh', 'en']);
const INDIVIDUAL_ROLES = new Set<AssociatedIndividual['role']>(['director', 'authorized_representative', 'ubo', 'shareholder']);
const BOOLEAN_FIELDS = [
  'isFinancialInstitution', 'managesClientAssets', 'isListedEntity', 'isLicensedEntity',
  'passportCtcProvided', 'hasThirdPartyFunding', 'legalExceptionApproved', 'needsNsBusiness',
] as const;

export class CaseValidationError extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CaseValidationError('JSON object is required.');
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, maxLength: number, required = false): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new CaseValidationError(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new CaseValidationError(`${field} must be a string.`);
  const normalized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (required && !normalized) throw new CaseValidationError(`${field} is required.`);
  if (normalized.length > maxLength) throw new CaseValidationError(`${field} is too long.`);
  return normalized || undefined;
}

function contactEmails(value: unknown): string | undefined {
  const raw = text(value, 'contactEmail', 3000);
  if (!raw) return undefined;
  const emails = Array.from(new Set(raw.split(/[\s,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)));
  if (emails.length > 20 || emails.some((email) => email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new CaseValidationError('contactEmail contains an invalid email address.');
  }
  return emails.join(', ');
}

function enumValue<T extends string>(value: unknown, field: string, allowed: ReadonlySet<T>, required = false): T | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CaseValidationError(`${field} is required.`);
    return undefined;
  }
  if (typeof value !== 'string' || !allowed.has(value as T)) throw new CaseValidationError(`${field} is invalid.`);
  return value as T;
}

function individuals(value: unknown): AssociatedIndividual[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) throw new CaseValidationError('individuals is invalid.');
  return value.map((candidate, index) => {
    const item = record(candidate);
    const id = text(item.id, `individuals[${index}].id`, 128, true)!;
    const name = text(item.name, `individuals[${index}].name`, 200, true)!;
    const role = enumValue(item.role, `individuals[${index}].role`, INDIVIDUAL_ROLES, true)!;
    const ownershipPercentage = item.ownershipPercentage;
    if (ownershipPercentage !== undefined && (typeof ownershipPercentage !== 'number' || !Number.isFinite(ownershipPercentage) || ownershipPercentage < 0 || ownershipPercentage > 100)) {
      throw new CaseValidationError(`individuals[${index}].ownershipPercentage is invalid.`);
    }
    if (item.isEntityShareholder !== undefined && typeof item.isEntityShareholder !== 'boolean') {
      throw new CaseValidationError(`individuals[${index}].isEntityShareholder must be boolean.`);
    }
    return { id, name, role, ownershipPercentage: ownershipPercentage as number | undefined, isEntityShareholder: item.isEntityShareholder as boolean | undefined };
  });
}

export function validateNewCaseInput(value: unknown): Omit<KYCCase, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'individuals' | 'receivedDocuments'> {
  const body = record(value);
  const result = {
    companyName: text(body.companyName, 'companyName', 200, true)!,
    contactEmail: contactEmails(body.contactEmail),
    jurisdiction: enumValue(body.jurisdiction, 'jurisdiction', JURISDICTIONS, true)!,
    usState: text(body.usState, 'usState', 100),
    businessType: enumValue(body.businessType, 'businessType', BUSINESS_TYPES, true)!,
    sourceOfFunds: text(body.sourceOfFunds, 'sourceOfFunds', 4000, true)!,
    customerType: enumValue(body.customerType, 'customerType', CUSTOMER_TYPES) || 'new_customer',
    entityType: enumValue(body.entityType, 'entityType', ENTITY_TYPES) || 'limited_company',
    riskRating: enumValue(body.riskRating, 'riskRating', RISK_RATINGS),
    language: enumValue(body.language, 'language', LANGUAGES) || 'zh',
    isFinancialInstitution: false,
    managesClientAssets: false,
    isListedEntity: false,
    isLicensedEntity: false,
    passportCtcProvided: false,
    hasThirdPartyFunding: false,
    legalExceptionApproved: false,
    needsNsBusiness: false,
  };
  for (const field of BOOLEAN_FIELDS) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') throw new CaseValidationError(`${field} must be boolean.`);
    if (typeof body[field] === 'boolean') result[field] = body[field];
  }
  return result;
}

export function validateCasePatch(value: unknown): Partial<KYCCase> {
  const body = record(value);
  const allowedFields = new Set([
    'companyName', 'contactEmail', 'jurisdiction', 'usState', 'businessType', 'sourceOfFunds',
    'customerType', 'entityType', 'riskRating', 'individuals', 'language',
    'emailDraft', 'openingEmailDraft', ...BOOLEAN_FIELDS,
  ]);
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));
  if (unknownFields.length) throw new CaseValidationError('Request contains fields that cannot be changed through this endpoint.');
  if (!Object.keys(body).length) throw new CaseValidationError('At least one editable field is required.');

  const patch: Partial<KYCCase> = {};
  if ('companyName' in body) patch.companyName = text(body.companyName, 'companyName', 200, true)!;
  if ('contactEmail' in body) patch.contactEmail = contactEmails(body.contactEmail);
  if ('jurisdiction' in body) patch.jurisdiction = enumValue(body.jurisdiction, 'jurisdiction', JURISDICTIONS, true)!;
  if ('usState' in body) patch.usState = text(body.usState, 'usState', 100);
  if ('businessType' in body) patch.businessType = enumValue(body.businessType, 'businessType', BUSINESS_TYPES, true)!;
  if ('sourceOfFunds' in body) patch.sourceOfFunds = text(body.sourceOfFunds, 'sourceOfFunds', 4000, true)!;
  if ('customerType' in body) patch.customerType = enumValue(body.customerType, 'customerType', CUSTOMER_TYPES, true)!;
  if ('entityType' in body) patch.entityType = enumValue(body.entityType, 'entityType', ENTITY_TYPES, true)!;
  if ('riskRating' in body) patch.riskRating = enumValue(body.riskRating, 'riskRating', RISK_RATINGS);
  if ('language' in body) patch.language = enumValue(body.language, 'language', LANGUAGES, true)!;
  if ('individuals' in body) patch.individuals = individuals(body.individuals)!;
  if ('emailDraft' in body) patch.emailDraft = text(body.emailDraft, 'emailDraft', 100_000);
  if ('openingEmailDraft' in body) patch.openingEmailDraft = text(body.openingEmailDraft, 'openingEmailDraft', 100_000);
  for (const field of BOOLEAN_FIELDS) {
    if (field in body) {
      if (typeof body[field] !== 'boolean') throw new CaseValidationError(`${field} must be boolean.`);
      patch[field] = body[field];
    }
  }
  return patch;
}
