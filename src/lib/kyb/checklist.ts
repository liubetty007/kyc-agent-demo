import { getMatrix } from './matrix';
import type { DocumentRequirement, EntityType, KYCCase } from './types';

const SUPPORTING_DOCUMENT_IDS = new Set([
  'business_description',
  'financing_agreement',
  'investor_lender_information',
  'proof_of_fund_transfer',
]);

function uniqueById(docs: DocumentRequirement[]): DocumentRequirement[] {
  return Array.from(new Map(docs.map((doc) => [doc.id, doc])).values());
}

function required(docs: DocumentRequirement[]): DocumentRequirement[] {
  return docs
    .filter((doc) => doc.required)
    .map((doc) => ({ ...doc, required: true, requirementType: 'required' }));
}

function conditional(docs: DocumentRequirement[], condition?: string): DocumentRequirement[] {
  return docs
    .filter((doc) => doc.required)
    .map((doc) => ({
      ...doc,
      required: true,
      requirementType: 'conditional_required',
      condition: doc.condition || condition,
    }));
}

function supporting(docs: DocumentRequirement[]): DocumentRequirement[] {
  return docs.map((doc) => ({
    ...doc,
    category: 'Supporting Documents',
    required: false,
    requirementType: 'supporting',
    condition: undefined,
  }));
}

function conditionalRequirement(
  id: string,
  name: string,
  category: string,
  condition: string,
  reason: string,
): DocumentRequirement {
  return {
    id,
    name,
    category,
    required: true,
    requirementType: 'conditional_required',
    condition,
    reason,
  };
}

function docsById(docs: DocumentRequirement[], ids: string[]): DocumentRequirement[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return ids.flatMap((id) => {
    const doc = byId.get(id);
    return doc ? [doc] : [];
  });
}

export function isCryptoRelated(caseData: Pick<KYCCase, 'businessType' | 'sourceOfFunds'>): boolean {
  if (caseData.businessType === 'btc_loan' || caseData.businessType === 'crypto_financing' || caseData.businessType === 'crypto') {
    return true;
  }
  const text = `${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  return ['crypto', 'btc', 'usdt', 'virtual asset', 'digital asset', 'wallet', 'exchange'].some((word) =>
    text.includes(word),
  );
}

export function isMiningRelated(caseData: Pick<KYCCase, 'businessType' | 'sourceOfFunds'>): boolean {
  if (caseData.businessType === 'mining_loan' || caseData.businessType === 'mining') {
    return true;
  }
  const text = `${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  return ['mining', 'miner', 'antpool', 'hashrate', 'mining pool'].some((word) => text.includes(word));
}

export function isFinancingSource(caseData: Pick<KYCCase, 'businessType' | 'sourceOfFunds' | 'hasThirdPartyFunding'>): boolean {
  if (caseData.hasThirdPartyFunding) return true;
  if (caseData.businessType === 'btc_loan' || caseData.businessType === 'financing' || caseData.businessType === 'crypto_financing') {
    return true;
  }
  const text = `${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  return ['financing', 'fundraising', 'investor', 'loan', 'shareholder loan', 'private placement'].some((word) =>
    text.includes(word),
  );
}

export function isFinancialInstitutionOrAssetManager(
  caseData: Pick<KYCCase, 'businessType' | 'sourceOfFunds' | 'isFinancialInstitution' | 'managesClientAssets'>,
): boolean {
  if (caseData.isFinancialInstitution || caseData.managesClientAssets) return true;
  const text = `${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  return [
    'licensed financial institution',
    'financial institution',
    'bank',
    'broker',
    'securities',
    'fund',
    'asset management',
    'asset manager',
    'custody',
    'custodian',
    'manage user assets',
    'managing user assets',
    'client assets',
    'customer assets',
    'user assets',
  ].some((word) => text.includes(word));
}

export function isHighRiskCustomer(
  caseData: Pick<KYCCase, 'jurisdiction' | 'businessType' | 'sourceOfFunds' | 'riskRating'>,
): boolean {
  if (caseData.riskRating) return caseData.riskRating === 'high';
  const matrix = getMatrix();
  const text = `${caseData.jurisdiction} ${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  return (
    matrix.jurisdiction_rules.high_risk_jurisdictions.list.includes(caseData.jurisdiction)
    || ['high risk', 'high-risk', '高风险', '高風險', 'edd', 'enhanced due diligence'].some((word) => text.includes(word))
  );
}

function caseSearchText(caseData: KYCCase): string {
  return `${caseData.companyName} ${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
}

function inferredEntityType(caseData: KYCCase): EntityType | undefined {
  if (caseData.entityType && caseData.entityType !== 'other') return caseData.entityType;
  const text = caseSearchText(caseData);
  if (/\bllc\b|limited liability company/.test(text)) return 'llc';
  if (/limited partnership|\blp\b|普通合[伙夥]人|有限合[伙夥]人/.test(text)) return 'limited_partnership';
  if (/\btrust\b|信托|信託/.test(text)) return 'trust';
  if (/\bspc\b|segregated portfolio|fund\b|基金/.test(text)) return 'spc_fund';
  if (/\binc\b|corporation|corp\b/.test(text)) return 'corporation';
  if (/\bltd\b|limited\b/.test(text)) return 'limited_company';
  return undefined;
}

function companyTypeDocuments(caseData: KYCCase): DocumentRequirement[] {
  const docs = getMatrix().company_type_documents || {};
  const entityType = inferredEntityType(caseData);
  const selected = entityType ? conditional(docs[entityType] || [], `Entity type is ${entityType.replaceAll('_', ' ')}`) : [];
  if (/change of name|changed name|formerly known|previous name|更改名称|更改名稱|曾用名/.test(caseSearchText(caseData))) {
    selected.push(...conditional(docs.name_change || [], 'Submitted records show a company name change'));
  }
  return selected;
}

function normalizedUsState(usState?: string): string | undefined {
  if (!usState) return undefined;
  const state = usState.trim().toLowerCase();
  const aliases: Record<string, string> = {
    de: 'Delaware',
    delaware: 'Delaware',
    wy: 'Wyoming',
    wyoming: 'Wyoming',
    nv: 'Nevada',
    nevada: 'Nevada',
    ca: 'California',
    california: 'California',
    tx: 'Texas',
    texas: 'Texas',
    ny: 'New York',
    'new york': 'New York',
    dc: 'Washington D.C.',
    'd.c.': 'Washington D.C.',
    'washington dc': 'Washington D.C.',
    'washington d.c.': 'Washington D.C.',
  };
  return aliases[state] || usState.trim();
}

function regionalCoreDocuments(caseData: KYCCase): DocumentRequirement[] {
  const matrix = getMatrix();
  const base = matrix.base_documents;
  const commonRequiredIds = [
    'certificate_of_incorporation',
    'articles_of_association',
    'source_of_funds',
  ];
  if (!caseData.isListedEntity && !caseData.isLicensedEntity) {
    commonRequiredIds.push('ownership_structure_chart');
  }

  const docs = required(docsById(base, commonRequiredIds));
  docs.push(...supporting(docsById(base, ['business_description'])));

  if (caseData.isListedEntity || caseData.isLicensedEntity) {
    docs.push(conditionalRequirement(
      'listed_or_licensed_entity_evidence',
      'Listed / Licensed Entity Status Evidence',
      'Ownership Exemption',
      'Ownership-chart exemption is claimed for a listed/licensed entity or its majority-owned subsidiary',
      'Evidence and ownership link are required to support the UBO / ownership-chart exemption',
    ));
  }

  if (caseData.jurisdiction === 'Hong Kong') {
    docs.push(...conditional(
      docsById(base, ['business_registration_certificate']),
      'Hong Kong company',
    ));
    docs.push(...conditional(
      docsById(matrix.hk_specific_documents, ['hk_nnc1_or_nar1', 'non_us_person_non_solicitation_hk_confirmation']),
      'Hong Kong company',
    ));
    if (/director change|director update|董事变更|董事變更|nd2a/i.test(caseData.sourceOfFunds)) {
      docs.push(...conditional(docsById(matrix.hk_specific_documents, ['hk_nd2a_director_change'])));
    }
    if (/shareholder change|shareholding change|股东变更|股東變更|register of members|\brom\b/i.test(caseData.sourceOfFunds)) {
      docs.push(...conditional(docsById(matrix.hk_specific_documents, ['hk_register_of_members'])));
    }
    return docs;
  }

  if (caseData.jurisdiction === 'Singapore') {
    docs.push(...conditional(matrix.singapore_specific_documents || [], 'Singapore company'));
    return docs;
  }

  docs.push(...conditional(
    docsById(base, ['certificate_of_incumbency']),
    'Entity is incorporated outside Hong Kong and Singapore',
  ));

  if (caseData.jurisdiction === 'United States') {
    if (!caseData.legalExceptionApproved) {
      docs.push(conditionalRequirement(
        'us_legal_compliance_exception_approval',
        'US Legal / Compliance Exception Approval',
        'US Restriction',
        'US registration or operations are identified',
        'US-related onboarding is restricted and requires Legal / Compliance approval before proceeding',
      ));
      return docs;
    }
    const state = normalizedUsState(caseData.usState);
    if (state && matrix.us_state_rules[state]) {
      docs.push(...conditional(matrix.us_state_rules[state], `Approved US exception; entity is registered in ${state}`));
    }
  }

  return docs;
}

function internalForms(caseData: KYCCase): DocumentRequirement[] {
  const forms = getMatrix().internal_forms;
  const customerFormId = caseData.customerType === 'new_counterparty'
    ? 'counterparty_due_diligence_form'
    : 'institution_onboarding_form';
  const docs = required(docsById(forms, [customerFormId, 'authorization_letter', 'mutual_nda']));
  const hasAuthorizedRepresentative = caseData.individuals.some((person) => person.role === 'authorized_representative');
  if (hasAuthorizedRepresentative) {
    docs.push(...conditional(docsById(forms, ['board_resolution'])));
  }
  if (isHighRiskCustomer(caseData)) {
    docs.push(...conditional(docsById(forms, ['declaration_source_of_fund_wealth'])));
  }
  return docs;
}

export function generateChecklist(caseData: KYCCase): DocumentRequirement[] {
  const matrix = getMatrix();
  const docs: DocumentRequirement[] = [
    ...regionalCoreDocuments(caseData),
    ...companyTypeDocuments(caseData),
    ...internalForms(caseData),
  ];

  const hasUbo = caseData.individuals.some(
    (person) => person.role === 'ubo' || (person.ownershipPercentage ?? 0) >= matrix.ubo_rule.threshold_percentage,
  );
  const hasDirectorOrAr = caseData.individuals.some(
    (person) => person.role === 'director' || person.role === 'authorized_representative',
  );
  const hasEntityShareholder = caseData.individuals.some((person) => person.isEntityShareholder);
  if (hasUbo || hasDirectorOrAr) {
    const individualDocs = matrix.associated_individual_documents.documents;
    docs.push(...required(docsById(individualDocs, ['passport_or_id', 'proof_of_current_residential_address'])));
    if (!caseData.passportCtcProvided) {
      docs.push(...conditional(docsById(individualDocs, ['online_identity_verification'])));
    }
  }
  if (hasEntityShareholder) {
    docs.push(...conditional(
      matrix.risk_based_documents.entity_shareholder,
      'A shareholder is a legal entity and ownership must be traced to natural-person UBOs',
    ));
  }

  if (isCryptoRelated(caseData)) {
    docs.push(...conditional(matrix.crypto_business_rules.documents));
  }
  if (isMiningRelated(caseData)) {
    docs.push(...conditional(matrix.mining_business_rules.documents));
  }
  if (isFinancingSource(caseData)) {
    docs.push(...supporting(matrix.financing_source_rules.required_documents));
  }
  if (isFinancialInstitutionOrAssetManager(caseData)) {
    docs.push(...conditional(matrix.risk_based_documents.financial_or_user_asset_manager));
  }
  if (isHighRiskCustomer(caseData)) {
    docs.push(...conditional(matrix.risk_based_documents.high_risk_customer || []));
  }

  return uniqueById(docs).map((doc) => {
    if (!SUPPORTING_DOCUMENT_IDS.has(doc.id)) return doc;
    return {
      ...doc,
      category: 'Supporting Documents',
      required: false,
      requirementType: 'supporting',
      condition: undefined,
      reason: doc.id === 'business_description'
        ? 'Useful supporting context for understanding the customer business; not a mandatory uploaded document'
        : 'Useful supporting evidence when financing or third-party funding requires further explanation; not mandatory by default',
    };
  });
}
