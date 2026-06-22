const BACKEND_URL = (process.env.KYC_BACKEND_URL || 'http://127.0.0.1:8012').replace(/\/+$/, '');

async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export type BackendIntake = {
  customer_type: 'corporate' | 'individual';
  customer_name: string;
  registration_country: string;
  business_description?: string;
  ubo_residence_country?: string;
  contact_email: string;
  language: 'zh' | 'en';
  needs_ns: boolean;
  tags: string[];
  attributes: Record<string, unknown>;
};

export type BackendCaseSummary = {
  case_id: string;
  customer_id: string;
  status: string;
  drive_folder_id?: string | null;
  selection: {
    package_id: string;
    package_name: string;
    rationale: string[];
    required_doc_types: string[];
    recommended_doc_types: string[];
  };
  email: {
    subject: string;
    body_text: string;
    attachments: string[];
    attachment_refs: Array<{ template_id: string; display_name: string; storage_uri: string }>;
  };
};

export type BackendChecklist = {
  required_doc_types: string[];
  recommended_doc_types: string[];
  received_doc_types: string[];
  pending_doc_types: string[];
  missing_required: string[];
  missing_recommended: string[];
};

export type BackendSendEmailResponse = {
  case_id: string;
  to_email: string;
  subject: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  attachments_sent: number;
};

export function isBackendEnabled(): boolean {
  return Boolean(process.env.KYC_BACKEND_URL);
}

export function createBackendCase(intake: BackendIntake) {
  return backendFetch<BackendCaseSummary>('/cases', {
    method: 'POST',
    body: JSON.stringify({ intake }),
  });
}

export function getBackendChecklist(caseId: string) {
  return backendFetch<BackendChecklist>(`/cases/${encodeURIComponent(caseId)}/checklist`);
}

export function sendBackendOpeningEmailMock(caseId: string) {
  return backendFetch(`/cases/${encodeURIComponent(caseId)}/send_opening_email_mock`, { method: 'POST' });
}

export type BackendDocument = {
  document_id: string;
  filename: string;
  storage_uri?: string | null;
  doc_type?: string | null;
  confidence?: number | null;
  extracted: Record<string, unknown>;
  verification: { status: string; issues: string[]; suggestions: string[] };
  review: { status: string; note?: string | null; doc_type?: string | null };
  source?: string | null;
  gmail_message_id?: string | null;
  reason?: string;
};

export type BackendIngestEmailResponse = {
  case_id: string;
  mode: 'gmail' | 'mock';
  imported_messages: number;
  created_documents: number;
  attachments: Array<{
    filename: string;
    doc_type?: string | null;
    confidence?: number | null;
    storage_uri?: string | null;
    verification_status: string;
    issues: string[];
  }>;
  checklist_missing_required: string[];
  checklist_missing_recommended: string[];
};

export function listBackendDocuments(caseId: string) {
  return backendFetch<BackendDocument[]>(`/cases/${encodeURIComponent(caseId)}/documents`);
}

export function createBackendDocument(
  caseId: string,
  body: { filename: string; storage_uri?: string; text?: string },
) {
  return backendFetch<BackendDocument>(`/cases/${encodeURIComponent(caseId)}/documents`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function ingestBackendEmail(caseId: string) {
  return backendFetch<BackendIngestEmailResponse>(`/cases/${encodeURIComponent(caseId)}/ingest_email`, {
    method: 'POST',
  });
}

export function ingestBackendEmailMock(
  caseId: string,
  payload: {
    from_email?: string;
    subject?: string;
    attachments: Array<{ filename: string; text?: string }>;
  },
) {
  return backendFetch<{
    case_id: string;
    created_documents: number;
    checklist_missing_required: string[];
    checklist_missing_recommended: string[];
  }>(`/cases/${encodeURIComponent(caseId)}/ingest_email_mock`, {
    method: 'POST',
    body: JSON.stringify({
      from: payload.from_email,
      subject: payload.subject,
      attachments: payload.attachments,
    }),
  });
}

export function reviewBackendDocument(
  caseId: string,
  documentId: string,
  body: { action: 'accept' | 'reject' | 'reclassify'; doc_type?: string; note?: string },
) {
  return backendFetch<BackendDocument>(
    `/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/review`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function sendBackendOpeningEmail(caseId: string) {
  return backendFetch<BackendSendEmailResponse>(`/cases/${encodeURIComponent(caseId)}/send_opening_email`, {
    method: 'POST',
  });
}

export type BackendComplianceReplyMessage = {
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  subject: string;
  body_text: string;
};

export function sendBackendComplianceEmail(
  caseId: string,
  body: { to_email: string; subject: string; body_text: string },
) {
  return backendFetch<BackendSendEmailResponse>(`/cases/${encodeURIComponent(caseId)}/send_compliance_email`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function ingestBackendComplianceEmail(caseId: string) {
  return backendFetch<{ case_id: string; imported_messages: number; messages: BackendComplianceReplyMessage[] }>(
    `/cases/${encodeURIComponent(caseId)}/ingest_compliance_email`,
    { method: 'POST' },
  );
}

export function sendBackendClientFollowUpEmail(caseId: string, body: { subject: string; body_text: string }) {
  return backendFetch<BackendSendEmailResponse>(`/cases/${encodeURIComponent(caseId)}/send_client_follow_up_email`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
