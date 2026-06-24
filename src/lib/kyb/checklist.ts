import { getMatrix } from './matrix';
import type { DocumentRequirement, KYCCase } from './types';

function uniqueById(docs: DocumentRequirement[]): DocumentRequirement[] {
  return Array.from(new Map(docs.map((doc) => [doc.id, doc])).values());
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

export function isFinancingSource(caseData: Pick<KYCCase, 'businessType' | 'sourceOfFunds'>): boolean {
  if (caseData.businessType === 'btc_loan' || caseData.businessType === 'financing' || caseData.businessType === 'crypto_financing') {
    return true;
  }
  const text = `${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  return ['financing', 'fundraising', 'investor', 'loan', 'shareholder loan', 'private placement'].some((word) =>
    text.includes(word),
  );
}

export function isFinancialInstitutionOrAssetManager(caseData: Pick<KYCCase, 'businessType' | 'sourceOfFunds'>): boolean {
  const text = `${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  return [
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

function docsById(docs: DocumentRequirement[], ids: string[]): DocumentRequirement[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return ids.flatMap((id) => {
    const doc = byId.get(id);
    return doc ? [doc] : [];
  });
}

function regionalCoreDocuments(caseData: KYCCase): DocumentRequirement[] {
  const matrix = getMatrix();
  const base = matrix.base_documents;

  if (caseData.jurisdiction === 'Hong Kong') {
    return [
      ...docsById(base, [
        'certificate_of_incorporation',
        'business_registration_certificate',
        'articles_of_association',
        'ownership_structure_chart',
        'source_of_funds',
      ]),
      ...docsById(matrix.hk_specific_documents, ['hk_nnc1_or_nar1', 'non_us_person_non_solicitation_hk_confirmation']),
    ];
  }

  if (caseData.jurisdiction === 'United States') {
    const state = normalizedUsState(caseData.usState);
    return [
      ...(state && matrix.us_state_rules[state] ? matrix.us_state_rules[state] : []),
      ...docsById(base, ['ownership_structure_chart', 'business_description', 'source_of_funds']),
    ];
  }

  return docsById(base, [
    'certificate_of_incorporation',
    'articles_of_association',
    'ownership_structure_chart',
    'business_description',
    'source_of_funds',
  ]);
}

export function generateChecklist(caseData: KYCCase): DocumentRequirement[] {
  const matrix = getMatrix();
  const docs: DocumentRequirement[] = [
    ...regionalCoreDocuments(caseData),
    ...matrix.internal_forms,
  ];

  const hasUbo = caseData.individuals.some(
    (person) => person.role === 'ubo' || (person.ownershipPercentage ?? 0) >= matrix.ubo_rule.threshold_percentage,
  );
  const hasDirectorOrAr = caseData.individuals.some(
    (person) => person.role === 'director' || person.role === 'authorized_representative',
  );
  const hasEntityShareholder = caseData.individuals.some((person) => person.isEntityShareholder);
  if (hasUbo || hasDirectorOrAr) {
    docs.push(...matrix.associated_individual_documents.documents);
  }
  if (hasEntityShareholder) {
    docs.push(...matrix.risk_based_documents.entity_shareholder);
  }

  if (isCryptoRelated(caseData)) {
    docs.push(...matrix.crypto_business_rules.documents);
  }

  if (isFinancialInstitutionOrAssetManager(caseData)) {
    docs.push(...matrix.risk_based_documents.financial_or_user_asset_manager);
  }

  return uniqueById(docs);
}
