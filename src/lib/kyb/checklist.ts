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

export function generateChecklist(caseData: KYCCase): DocumentRequirement[] {
  const matrix = getMatrix();
  const docs: DocumentRequirement[] = [
    ...matrix.base_documents,
    ...matrix.internal_forms,
  ];

  if (caseData.jurisdiction === 'Hong Kong') {
    docs.push(...matrix.hk_specific_documents);
  }

  const hasUbo = caseData.individuals.some(
    (person) => person.role === 'ubo' || (person.ownershipPercentage ?? 0) >= matrix.ubo_rule.threshold_percentage,
  );
  const hasDirectorOrAr = caseData.individuals.some(
    (person) => person.role === 'director' || person.role === 'authorized_representative',
  );
  if (hasUbo || hasDirectorOrAr) {
    docs.push(...matrix.associated_individual_documents.documents);
  }

  if (isCryptoRelated(caseData)) {
    docs.push(...matrix.crypto_business_rules.documents);
  }

  if (isMiningRelated(caseData)) {
    docs.push(...matrix.mining_business_rules.documents);
  }

  if (isFinancingSource(caseData)) {
    docs.push(...matrix.financing_source_rules.required_documents);
  }

  return uniqueById(docs);
}
