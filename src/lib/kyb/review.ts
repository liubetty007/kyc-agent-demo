import { addMonths, isAfter, parseISO } from './time';
import { generateChecklist, isCryptoRelated, isFinancialInstitutionOrAssetManager, isFinancingSource, isMiningRelated } from './checklist';
import { getMatrix } from './matrix';
import type { DocumentRequirement, KYCCase, ReviewIssue, ReviewResult } from './types';

function uniqueById(docs: DocumentRequirement[]): DocumentRequirement[] {
  return Array.from(new Map(docs.map((doc) => [doc.id, doc])).values());
}

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

function isDocumentOlderThan(issueDate: string | undefined, months: number): boolean {
  if (!issueDate) return false;
  const maxAgeDate = addMonths(parseISO(issueDate), months);
  return isAfter(new Date(), maxAgeDate);
}

function isPdfDocument(filename: string): boolean {
  return /\.pdf$/i.test(filename.trim());
}

function hasDocument(caseData: KYCCase, requirementId: string): boolean {
  return caseData.receivedDocuments.some(
    (doc) => doc.requirementId === requirementId && (doc.status === 'received' || doc.status === 'accepted'),
  );
}

function firstDocument(caseData: KYCCase, requirementIds: string[]) {
  return caseData.receivedDocuments.find(
    (doc) => requirementIds.includes(doc.requirementId) && (doc.status === 'received' || doc.status === 'accepted'),
  );
}

export function runReview(caseData: KYCCase): ReviewResult {
  const matrix = getMatrix();
  const requiredDocuments = uniqueById([...(caseData.checklist || []), ...generateChecklist(caseData)]);
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

  for (const doc of caseData.receivedDocuments) {
    if (!isPdfDocument(doc.name)) {
      issues.push({ severity: 'medium', code: 'non_pdf_document', message: `${doc.name} is not a PDF. Standard KYC rules require all submitted documents to be provided in PDF format.` });
      questionsForClient.push(`Please resubmit ${doc.name} in PDF format.`);
    }
  }

  const hasUbo = caseData.individuals.some(
    (person) => person.role === 'ubo' || (person.ownershipPercentage ?? 0) >= matrix.ubo_rule.threshold_percentage,
  );
  if (!hasUbo) {
    issues.push({ severity: 'high', code: 'ubo_not_identified', message: 'No natural person UBO with ownership >= 25% was identified.' });
    questionsForClient.push('Please provide ownership information identifying all natural person UBOs with ownership of 25% or more.');
  }

  const coi = firstDocument(caseData, ['certificate_of_incorporation']);
  const coiFreshnessRule = matrix.standard_kyc_rules.coi_recent_issue_months_except;
  if (coi && !coiFreshnessRule.excluded_jurisdictions.includes(caseData.jurisdiction)) {
    if (!coi.issueDate) {
      issues.push({ severity: 'medium', code: 'coi_issue_date_missing', message: `${coi.name} has no issue date; manual review must confirm it was issued within ${coiFreshnessRule.max_age_months} months.` });
    } else if (isDocumentOlderThan(coi.issueDate, coiFreshnessRule.max_age_months)) {
      issues.push({ severity: 'high', code: 'coi_expired', message: `${coi.name} is older than ${coiFreshnessRule.max_age_months} months for a non-HK/non-SG entity.` });
      questionsForClient.push(`Please provide a Certificate of Incorporation issued within the last ${coiFreshnessRule.max_age_months} months, unless Compliance confirms an exception.`);
    }
  }

  const certificateOfIncumbency = firstDocument(caseData, ['certificate_of_incumbency', 'us_wy_certificate_of_incumbency']);
  if (certificateOfIncumbency) {
    const maxAge = matrix.standard_kyc_rules.certificate_of_incumbency_max_age_months;
    if (!certificateOfIncumbency.issueDate) {
      issues.push({ severity: 'medium', code: 'incumbency_issue_date_missing', message: `${certificateOfIncumbency.name} has no issue date; manual review must confirm it was issued within ${maxAge} months.` });
    } else if (isDocumentOlderThan(certificateOfIncumbency.issueDate, maxAge)) {
      issues.push({ severity: 'high', code: 'incumbency_expired', message: `${certificateOfIncumbency.name} is older than ${maxAge} months.` });
      questionsForClient.push(`Please provide a Certificate of Incumbency issued within the last ${maxAge} months.`);
    }
  }

  const stateStatusDocument = firstDocument(caseData, [
    'us_de_good_standing',
    'us_wy_good_standing',
    'us_nv_certificate_of_existence',
    'us_tx_certificate_of_fact_status',
  ]);
  if (stateStatusDocument && !stateStatusDocument.issueDate) {
    issues.push({ severity: 'medium', code: 'us_status_document_date_missing', message: `${stateStatusDocument.name} has no issue date; manual review must confirm state status evidence is current.` });
  } else if (stateStatusDocument && isDocumentOlderThan(stateStatusDocument.issueDate, 6)) {
    issues.push({ severity: 'high', code: 'us_status_document_expired', message: `${stateStatusDocument.name} is older than 6 months.` });
    questionsForClient.push('Please provide current US state status evidence, such as Good Standing, Certificate of Existence, or Certificate of Fact - Status issued within the last 6 months.');
  }

  if (!hasDocument(caseData, 'articles_of_association')) {
    const operatingAgreementProvided = caseData.receivedDocuments.some((doc) =>
      doc.requirementId.includes('operating_agreement') && (doc.status === 'received' || doc.status === 'accepted'),
    );
    if (!operatingAgreementProvided) {
      issues.push({ severity: 'medium', code: 'articles_or_operating_agreement_missing', message: 'Articles of Association are missing and no Operating Agreement / equivalent fallback is on file.' });
      questionsForClient.push('Please provide Articles of Association, or Operating Agreement if Articles are not available.');
    }
  }

  const sourceEvidenceText = [
    caseData.sourceOfFunds,
    ...caseData.receivedDocuments
      .filter((doc) => ['source_of_funds', 'source_of_crypto_assets', 'declaration_source_of_fund_wealth'].includes(doc.requirementId))
      .map((doc) => `${doc.name} ${doc.notes || ''}`),
  ].join(' ').toLowerCase();
  if (!sourceEvidenceText.includes('usd') && !sourceEvidenceText.includes('$')) {
    issues.push({ severity: 'medium', code: 'expected_transaction_volume_usd_missing', message: 'SOW/SOF evidence should include expected annual or monthly transaction volume in fiat USD.' });
    questionsForClient.push('Please provide expected monthly or annual transaction volume in USD as part of the source of funds / source of wealth information.');
  }

  const signedDocumentIds = new Set(['board_resolution', 'mutual_nda', 'institution_onboarding_form', 'authorization_letter']);
  for (const doc of caseData.receivedDocuments.filter((item) => signedDocumentIds.has(item.requirementId) && (item.status === 'received' || item.status === 'accepted'))) {
    issues.push({ severity: 'low', code: 'signed_document_details_review_required', message: `${doc.name} must be manually checked for signer name, title, and signing date.` });
  }

  if (hasDocument(caseData, 'board_resolution')) {
    issues.push({ severity: 'low', code: 'board_resolution_scope_review_required', message: 'Board Resolution must identify all authorized persons and define their permitted business scope, even for one-director entities.' });
  }

  if (hasDocument(caseData, 'mutual_nda')) {
    issues.push({ severity: 'low', code: 'nda_counterparty_review_required', message: `NDA must use the correct current counterparty: ${matrix.standard_kyc_rules.allowed_nda_counterparties.join(', ')}. Template changes require Legal confirmation; third-party templates require Legal and Business confirmation.` });
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

  if (isFinancialInstitutionOrAssetManager(caseData) && !acceptedOrReceived.has('aml_questionnaire')) {
    issues.push({ severity: 'high', code: 'missing_aml_questionnaire', message: 'Financial institutions or entities managing user assets must provide an AML Questionnaire.' });
    questionsForClient.push('Please provide the AML Questionnaire because the applicant appears to be a financial institution or manages user/client assets.');
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
      ...(isFinancialInstitutionOrAssetManager(caseData) ? ['Financial institution / manages user assets'] : []),
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
