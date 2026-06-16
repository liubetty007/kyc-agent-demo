import { addMonths, isAfter, parseISO } from './time';
import { generateChecklist, isCryptoRelated, isFinancingSource, isMiningRelated } from './checklist';
import { getMatrix } from './matrix';
import type { DocumentRequirement, KYCCase, ReviewIssue, ReviewResult } from './types';

function jurisdictionAssessment(caseData: KYCCase): ReviewResult['jurisdictionAssessment'] {
  const matrix = getMatrix();
  const notes: string[] = [];
  if (matrix.jurisdiction_rules.prohibited.includes(caseData.jurisdiction)) {
    notes.push(`${caseData.jurisdiction} is prohibited under current onboarding policy.`);
    return { status: 'prohibited', notes };
  }
  if (caseData.jurisdiction === 'United States' && !caseData.usState) {
    notes.push('US company requires state-level information and legal/compliance review.');
    return { status: 'legal_review_required', notes };
  }
  if (matrix.jurisdiction_rules.requires_legal_review.includes(caseData.jurisdiction)) {
    notes.push(`${caseData.jurisdiction} requires legal review.`);
    return { status: 'legal_review_required', notes };
  }
  if (matrix.jurisdiction_rules.offshore.includes(caseData.jurisdiction)) {
    notes.push(`${caseData.jurisdiction} is marked as offshore risk.`);
  }
  if (caseData.jurisdiction === 'Hong Kong') {
    notes.push('HK company requires Non-US Person & Non-solicitation in HK Confirmation.');
  }
  return { status: 'accepted', notes };
}

function isAddressProofExpired(issueDate?: string): boolean {
  if (!issueDate) return false;
  const maxAgeDate = addMonths(parseISO(issueDate), 3);
  return isAfter(new Date(), maxAgeDate);
}

export function runReview(caseData: KYCCase): ReviewResult {
  const matrix = getMatrix();
  const requiredDocuments = caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData);
  const requiredDocumentIds = new Set(requiredDocuments.filter((doc) => doc.required).map((doc) => doc.id));
  const acceptedOrReceived = new Set(
    caseData.receivedDocuments
      .filter((doc) => doc.status === 'received' || doc.status === 'accepted')
      .map((doc) => doc.requirementId),
  );
  const missingDocuments = requiredDocuments.filter((doc) => doc.required && !acceptedOrReceived.has(doc.id));
  const issues: ReviewIssue[] = [];
  const questionsForClient: string[] = [];
  const jurisdiction = jurisdictionAssessment(caseData);

  if (jurisdiction.status === 'prohibited') {
    issues.push({ severity: 'prohibited', code: 'prohibited_jurisdiction', message: jurisdiction.notes[0] });
  }
  if (jurisdiction.status === 'legal_review_required') {
    issues.push({ severity: 'high', code: 'legal_review_required', message: jurisdiction.notes[0] });
  }

  const hasUbo = caseData.individuals.some(
    (person) => person.role === 'ubo' || (person.ownershipPercentage ?? 0) >= matrix.ubo_rule.threshold_percentage,
  );
  if (!hasUbo) {
    issues.push({ severity: 'high', code: 'ubo_not_identified', message: 'No natural person UBO with ownership >= 25% was identified.' });
    questionsForClient.push('Please provide ownership information identifying all natural person UBOs with ownership of 25% or more.');
  }

  for (const doc of caseData.receivedDocuments) {
    if (doc.requirementId === 'proof_of_current_residential_address') {
      if (!doc.issueDate) {
        issues.push({ severity: 'medium', code: 'address_proof_date_missing', message: `${doc.name} has no issue date; manual review needed to confirm it was issued within 3 months.` });
      } else if (isAddressProofExpired(doc.issueDate)) {
        issues.push({ severity: 'high', code: 'expired_address_proof', message: `${doc.name} is older than 3 months.` });
        questionsForClient.push('Please provide a proof of current residential address issued within the last 3 months.');
      }
    }
  }

  for (const doc of missingDocuments) {
    if (requiredDocumentIds.has(doc.id)) {
      questionsForClient.push(`Please provide ${doc.name}.`);
    }
  }

  if (isCryptoRelated(caseData)) {
    const hasAlternativeCryptoEvidence = caseData.receivedDocuments.some((doc) =>
      ['source_of_crypto_assets', 'exchange_statement', 'custodian_statement', 'transaction_history', 'bank_statement', 'financing_agreement', 'mining_pool_evidence'].includes(doc.requirementId),
    );
    if (!hasAlternativeCryptoEvidence) {
      issues.push({ severity: 'high', code: 'missing_source_of_crypto_assets', message: 'Crypto-related customer has not provided sufficient source of crypto assets evidence.' });
      questionsForClient.push('Please provide supporting evidence for source of funds / source of crypto assets. This may include exchange statements, custodian statements, transaction history, wallet addresses, audited financial statements, financing documents, or other evidence.');
    }
  }

  if (isMiningRelated(caseData) && !acceptedOrReceived.has('mining_proof')) {
    issues.push({ severity: 'high', code: 'missing_mining_proof', message: 'Mining business requires mining proof such as Antpool Observer Link or equivalent evidence.' });
    questionsForClient.push('Please provide mining proof, such as an Antpool Observer Link or equivalent mining pool observer link, mining revenue records, or other evidence showing source of mining proceeds.');
  }

  if (isFinancingSource(caseData)) {
    const financingDocs = ['financing_agreement', 'investor_lender_information', 'proof_of_fund_transfer'];
    const missingFinancing = financingDocs.filter((docId) => !acceptedOrReceived.has(docId));
    if (missingFinancing.length) {
      issues.push({ severity: 'high', code: 'missing_financing_evidence', message: 'Source of funds is financing but financing evidence is incomplete.' });
      questionsForClient.push('Please provide financing agreement, investor/lender information, and proof of fund transfer showing source and movement of funds.');
    }
  }

  const businessAssessment = {
    cryptoRelated: isCryptoRelated(caseData),
    miningRelated: isMiningRelated(caseData),
    financingSourceDetected: isFinancingSource(caseData),
    riskFlags: [
      ...(isCryptoRelated(caseData) ? ['Crypto-related business'] : []),
      ...(isMiningRelated(caseData) ? ['Mining business'] : []),
      ...(isFinancingSource(caseData) ? ['Financing source of funds'] : []),
      ...(getMatrix().jurisdiction_rules.offshore.includes(caseData.jurisdiction) ? ['Offshore jurisdiction'] : []),
    ],
  };

  let recommendedNextAction: ReviewResult['recommendedNextAction'] = 'submit_to_compliance';
  if (jurisdiction.status === 'prohibited') recommendedNextAction = 'do_not_onboard';
  else if (jurisdiction.status === 'legal_review_required') recommendedNextAction = 'legal_review';
  else if (missingDocuments.length || issues.some((issue) => issue.severity === 'high')) recommendedNextAction = 'request_more_information';

  return {
    jurisdictionAssessment: jurisdiction,
    businessAssessment,
    requiredDocuments,
    receivedDocuments: caseData.receivedDocuments,
    missingDocuments,
    issues,
    questionsForClient: Array.from(new Set(questionsForClient)),
    recommendedNextAction,
  };
}

export function groupDocsByCategory(docs: DocumentRequirement[]) {
  return docs.reduce<Record<string, DocumentRequirement[]>>((acc, doc) => {
    acc[doc.category] ||= [];
    acc[doc.category].push(doc);
    return acc;
  }, {});
}
