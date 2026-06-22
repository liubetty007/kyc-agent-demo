export type Jurisdiction =
  | 'Hong Kong'
  | 'Singapore'
  | 'BVI'
  | 'Cayman'
  | 'United States'
  | 'European countries'
  | 'Other offshore'
  | 'Other countries'
  | 'Mainland China';

/** Primary UI values: 质押借贷 / 矿业贷. Legacy values kept for seeded demo cases. */
export type BusinessType =
  | 'btc_loan'
  | 'mining_loan'
  | 'normal'
  | 'crypto'
  | 'mining'
  | 'financing'
  | 'crypto_financing'
  | 'other';

export const BUSINESS_TYPE_OPTIONS: Array<{ value: 'btc_loan' | 'mining_loan'; label: string; hint: string }> = [
  { value: 'mining_loan', label: '矿业贷', hint: 'Default prime onboarding (no 币贷 extras)' },
  { value: 'btc_loan', label: '质押借贷', hint: 'BTC 币贷 — extra confirmations & templates' },
];

export function businessTypeLabel(businessType: BusinessType): string {
  const match = BUSINESS_TYPE_OPTIONS.find((opt) => opt.value === businessType);
  if (match) return match.label;
  return businessType;
}

export type CaseLanguage = 'zh' | 'en';

export type CaseStatus =
  | 'created'
  | 'checklist_generated'
  | 'documents_received'
  | 'agent_reviewed'
  | 'ready_for_compliance'
  | 'compliance_review'
  | 'awaiting_client_information'
  | 'edd_required'
  | 'approved'
  | 'rejected'
  | 'prohibited';

export type ComplianceDecisionOutcome = 'approved' | 'rejected' | 'request_more_info' | 'edd_required';

export type ComplianceDecision = {
  outcome: ComplianceDecisionOutcome;
  note: string;
  reviewerEmail: string;
  decidedAt: string;
};

export type ComplianceSubmitSnapshot = {
  missing_required: string[];
  missing_recommended: string[];
  pending_doc_types: string[];
  received_doc_types: string[];
  submittedBy: string;
  submittedAt: string;
};

export type DocumentRequirement = {
  id: string;
  name: string;
  category: string;
  required: boolean;
  reason: string;
};

export type DocumentSource = 'manual' | 'email_demo' | 'gmail';

export type EmailAttachmentAnalysis = {
  filename: string;
  suggestedRequirementId?: string;
  documentType?: string;
  confidence: number;
  reason: string;
};

export type EmailIntakeAnalysis = {
  intent:
    | 'new_submission'
    | 'supplemental_documents'
    | 'clarification'
    | 'reminder'
    | 'withdrawal'
    | 'unrelated'
    | 'unknown';
  keywords: string[];
  entities: {
    companyName?: string;
    caseId?: string;
    jurisdiction?: string;
    people?: string[];
  };
  summary: string;
  suggestedCaseStatus?: CaseStatus;
  requiresHumanReview: boolean;
  confidence: number;
  evidence: string[];
  attachments: EmailAttachmentAnalysis[];
};

export type ReceivedDocument = {
  id: string;
  requirementId: string;
  name: string;
  status: 'received' | 'accepted' | 'needs_review' | 'invalid';
  issueDate?: string;
  notes?: string;
  source?: DocumentSource;
  fromEmail?: string;
  emailSubject?: string;
  receivedAt?: string;
  confidence?: number;
  storageObject?: string;
};

export type AssociatedIndividual = {
  id: string;
  name: string;
  role: 'director' | 'authorized_representative' | 'ubo' | 'shareholder';
  ownershipPercentage?: number;
  isEntityShareholder?: boolean;
};

export type MailboxMessage = {
  id: string;
  provider?: 'demo' | 'gmail';
  providerMessageId?: string;
  threadId?: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  direction: 'outbound' | 'inbound' | 'internal';
  status: 'draft' | 'sent' | 'received';
  attachments?: string[];
  analysis?: EmailIntakeAnalysis;
};

export type KYCCase = {
  id: string;
  companyName: string;
  contactEmail?: string;
  jurisdiction: Jurisdiction;
  usState?: string;
  businessType: BusinessType;
  sourceOfFunds: string;
  language?: CaseLanguage;
  needsNsBusiness?: boolean;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  individuals: AssociatedIndividual[];
  receivedDocuments: ReceivedDocument[];
  checklist?: DocumentRequirement[];
  review?: ReviewResult;
  openingEmailDraft?: string;
  openingEmailSentAt?: string;
  emailDraft?: string;
  compliancePack?: string;
  complianceEmailDraft?: string;
  complianceEmailTo?: string;
  complianceEmailSentAt?: string;
  complianceGmailThreadId?: string;
  complianceSubmittedAt?: string;
  complianceSubmitSnapshot?: ComplianceSubmitSnapshot;
  complianceDecisions?: ComplianceDecision[];
  mailboxMessages?: MailboxMessage[];
  driveFolderId?: string;
};

export type ReviewIssue = {
  severity: 'low' | 'medium' | 'high' | 'prohibited';
  code: string;
  message: string;
};

export type ReviewResult = {
  jurisdictionAssessment: {
    status: 'accepted' | 'legal_review_required' | 'manual_review_required' | 'prohibited';
    notes: string[];
  };
  businessAssessment: {
    cryptoRelated: boolean;
    miningRelated: boolean;
    financingSourceDetected: boolean;
    riskFlags: string[];
  };
  requiredDocuments: DocumentRequirement[];
  receivedDocuments: ReceivedDocument[];
  missingDocuments: DocumentRequirement[];
  issues: ReviewIssue[];
  questionsForClient: string[];
  recommendedNextAction: 'request_more_information' | 'legal_review' | 'do_not_onboard' | 'submit_to_compliance';
};

export type MatrixConfig = {
  ubo_rule: { threshold_percentage: number; operator: '>='; description: string };
  address_proof_rule: { max_age_months: number; applies_to: string[]; required: boolean };
  standard_kyc_rules: {
    kyc_validity_months: number;
    required_file_format: string;
    signed_document_requirements: string[];
    coi_recent_issue_months_except: { max_age_months: number; excluded_jurisdictions: string[] };
    certificate_of_incumbency_max_age_months: number;
    nda_validity_years: number;
    allowed_nda_counterparties: string[];
    email_sla_hours: number;
    external_date_formats: string[];
  };
  jurisdiction_rules: {
    accepted_standard: string[];
    requires_state: string[];
    requires_legal_review: string[];
    offshore: string[];
    prohibited: string[];
    high_risk_jurisdictions: { source: string; list: string[]; default_action: string };
  };
  base_documents: DocumentRequirement[];
  hk_specific_documents: DocumentRequirement[];
  internal_forms: DocumentRequirement[];
  us_state_rules: Record<string, DocumentRequirement[]>;
  risk_based_documents: {
    financial_or_user_asset_manager: DocumentRequirement[];
    entity_shareholder: DocumentRequirement[];
    worldcheck_alert: DocumentRequirement[];
  };
  associated_individual_documents: { roles: string[]; documents: DocumentRequirement[] };
  crypto_business_rules: {
    source_of_crypto_assets_required: boolean;
    wallet_address_list_required: boolean;
    wallet_address_list_policy: string;
    alternative_evidence_accepted: string[];
    missing_evidence_issue: string;
    documents: DocumentRequirement[];
  };
  mining_business_rules: {
    mining_proof_required: boolean;
    accepted_mining_proof: string[];
    wallet_receiving_mining_proceeds_required: boolean;
    wallet_policy: string;
    documents: DocumentRequirement[];
  };
  financing_source_rules: { required_documents: DocumentRequirement[]; supporting_documents: string[] };
};
