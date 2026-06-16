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

export type BusinessType = 'normal' | 'crypto' | 'mining' | 'financing' | 'crypto_financing' | 'other';

export type CaseStatus =
  | 'created'
  | 'checklist_generated'
  | 'documents_received'
  | 'agent_reviewed'
  | 'ready_for_compliance'
  | 'prohibited';

export type DocumentRequirement = {
  id: string;
  name: string;
  category: string;
  required: boolean;
  reason: string;
};

export type DocumentSource = 'manual' | 'email_demo';

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
  from: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  direction: 'outbound' | 'inbound' | 'internal';
  status: 'draft' | 'sent' | 'received';
  attachments?: string[];
};

export type KYCCase = {
  id: string;
  companyName: string;
  contactEmail?: string;
  jurisdiction: Jurisdiction;
  usState?: string;
  businessType: BusinessType;
  sourceOfFunds: string;
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
  complianceEmailSentAt?: string;
  mailboxMessages?: MailboxMessage[];
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
