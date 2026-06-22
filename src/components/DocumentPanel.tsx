'use client';

import { useEffect, useState } from 'react';
import type { BackendDocument } from '@/lib/kyc-backend/client';
import { readResponseError } from '@/lib/http';
import type { KYCCase, ReceivedDocument } from '@/lib/kyb/types';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

function formatDocType(docType: string): string {
  return docType.replaceAll('_', ' ');
}

function classificationMethod(doc: BackendDocument): string {
  const method = doc.extracted?.classification_method;
  return typeof method === 'string' ? method : doc.reason?.startsWith('llm:') ? 'llm' : 'keyword';
}

function classificationReason(doc: BackendDocument): string {
  const reason = doc.extracted?.reason;
  if (typeof reason === 'string' && reason) return reason;
  return '';
}

function textPreview(doc: BackendDocument): string {
  const preview = doc.extracted?.text_preview;
  return typeof preview === 'string' ? preview : '';
}

function DocumentClassificationDetails({ doc }: { doc: BackendDocument }) {
  const [open, setOpen] = useState(false);
  const method = classificationMethod(doc);
  const reason = classificationReason(doc);
  const preview = textPreview(doc);

  if (!reason && !preview) return null;

  return (
    <div className="document-meta small" style={{ marginTop: 8 }}>
      <button type="button" className="button" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setOpen(!open)}>
        {open ? 'Hide classification details' : 'Show classification details'}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: 10, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div><strong>Method:</strong> {method === 'llm' ? 'LLM' : 'Keyword rules'}</div>
          {reason && <div style={{ marginTop: 6 }}><strong>Reason:</strong> {reason}</div>}
          {preview ? (
            <div style={{ marginTop: 6 }}>
              <strong>Text preview:</strong>
              <pre style={{ whiteSpace: 'pre-wrap', marginTop: 4, fontSize: 12 }}>{preview}</pre>
            </div>
          ) : (
            <div style={{ marginTop: 6 }}><em>No extracted text preview (keyword-only or empty PDF text).</em></div>
          )}
        </div>
      )}
    </div>
  );
}

export function DocumentPanel({ caseData, viewerRole }: { caseData: KYCCase; viewerRole: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [backendDocs, setBackendDocs] = useState<BackendDocument[]>([]);
  const [backendChecklist, setBackendChecklist] = useState<{
    missing_required: string[];
    pending_doc_types: string[];
    received_doc_types: string[];
  } | null>(null);
  const backendMode = isBackendCaseId(caseData.id);

  async function refreshBackend() {
    const [docsRes, checklistRes] = await Promise.all([
      fetch(`/api/cases/${caseData.id}/backend-documents`),
      fetch(`/api/cases/${caseData.id}/backend-checklist`),
    ]);
    if (docsRes.ok) setBackendDocs(await docsRes.json());
    if (checklistRes.ok) setBackendChecklist(await checklistRes.json());
  }

  useEffect(() => {
    if (backendMode) refreshBackend();
  }, [caseData.id, backendMode]);

  async function upsertDocument(doc: Partial<ReceivedDocument> & { requirementId: string; name: string }) {
    setLoading(doc.requirementId);
    const response = await fetch(`/api/cases/${caseData.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    if (!response.ok) {
      alert(await readResponseError(response, 'Upload failed.'));
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  async function uploadDocument(requirementId: string, file?: File) {
    if (!file) return;
    setLoading(requirementId);
    const form = new FormData();
    form.set('requirementId', requirementId);
    form.set('file', file);
    const response = await fetch(`/api/cases/${caseData.id}/documents`, { method: 'POST', body: form });
    if (!response.ok) {
      alert((await response.json()).error || 'Upload failed.');
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  function renderUploadButton(requirementId: string, label: string) {
    return (
      <label className="button upload-button">
        {loading === requirementId ? `${label}...` : label}
        <input
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
          disabled={loading === requirementId}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            uploadDocument(requirementId, file);
          }}
        />
      </label>
    );
  }

  async function reviewBackend(documentId: string, action: 'accept' | 'reject', docType?: string) {
    setLoading(documentId);
    const response = await fetch(`/api/cases/${caseData.id}/backend-documents/${documentId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, doc_type: docType }),
    });
    if (!response.ok) {
      alert(await readResponseError(response, 'Review failed.'));
      setLoading(null);
      return;
    }
    await refreshBackend();
    setLoading(null);
  }

  async function regenerateChecklist() {
    setLoading('checklist');
    const response = await fetch(`/api/cases/${caseData.id}/checklist`, { method: 'POST' });
    if (!response.ok) {
      alert(await readResponseError(response, 'Regenerate checklist failed.'));
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  function docForRequirement(requirementId: string): BackendDocument | undefined {
    const matches = backendDocs.filter((doc) => doc.doc_type === requirementId);
    if (!matches.length) return undefined;
    return (
      matches.find((doc) => doc.review.status === 'accepted')
      || matches.find((doc) => doc.review.status === 'pending')
      || matches[0]
    );
  }

  function statusBadgeBackend(doc?: BackendDocument, localDoc?: ReceivedDocument) {
    if (!doc && localDoc) return statusBadgeLocal(localDoc);
    if (!doc) return <span className="badge medium">missing</span>;
    if (doc.review.status === 'accepted') return <span className="badge accepted">accepted</span>;
    if (doc.review.status === 'rejected') return <span className="badge prohibited">revision requested</span>;
    return <span className="badge needs-review">pending review</span>;
  }

  const receivedByRequirement = new Map(caseData.receivedDocuments.map((doc) => [doc.requirementId, doc]));

  function statusBadgeLocal(doc?: ReceivedDocument) {
    if (!doc) return <span className="badge medium">missing</span>;
    if (doc.status === 'needs_review') return <span className="badge needs-review">pending review</span>;
    if (doc.status === 'invalid') return <span className="badge prohibited">invalid</span>;
    return <span className="badge accepted">{doc.status}</span>;
  }

  const unmatchedBackendDocs = backendDocs.filter(
    (doc) => !doc.doc_type || !(caseData.checklist || []).some((item) => item.id === doc.doc_type),
  );
  const locallyReceivedIds = new Set(
    caseData.receivedDocuments
      .filter((doc) => doc.status === 'received' || doc.status === 'accepted')
      .map((doc) => doc.requirementId),
  );
  const backendChecklistDisplay = backendChecklist
    ? {
      ...backendChecklist,
      missing_required: backendChecklist.missing_required.filter((docType) => !locallyReceivedIds.has(docType)),
      received_doc_types: Array.from(new Set([...backendChecklist.received_doc_types, ...locallyReceivedIds])),
    }
    : null;

  return (
    <div className="card">
      <div className="card-heading">
        <h2>Document Checklist</h2>
        {viewerRole !== 'client' && (
          <div className="actions" style={{ justifyContent: 'flex-end' }}>
            <button className="button" type="button" disabled={Boolean(loading)} onClick={regenerateChecklist}>
              {loading === 'checklist' ? 'Regenerating…' : 'Regenerate Checklist'}
            </button>
          </div>
        )}
      </div>
      <p>
        {backendMode
          ? 'Files from client replies are auto-classified. Accept a document to mark the checklist item as received.'
          : 'Use “Fetch Email Reply” above to import attachments, or upload files directly from each checklist item.'}
      </p>

      {backendMode && backendChecklistDisplay && (
        <div className="small" style={{ marginBottom: 12 }}>
          <strong>Accepted:</strong> {backendChecklistDisplay.received_doc_types.map(formatDocType).join(', ') || 'none'}
          <br />
          <strong>Pending review:</strong> {backendChecklistDisplay.pending_doc_types.map(formatDocType).join(', ') || 'none'}
          <br />
          <strong>Still missing:</strong> {backendChecklistDisplay.missing_required.map(formatDocType).join(', ') || 'none'}
        </div>
      )}

      <table className="table">
        <thead><tr><th>Document</th><th>Category</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {(caseData.checklist || []).map((requirement) => {
            if (backendMode) {
              const doc = docForRequirement(requirement.id);
              const localDoc = receivedByRequirement.get(requirement.id);
              return (
                <tr key={requirement.id}>
                  <td>
                    <strong>{requirement.name}</strong><br />
                    <span className="small">{requirement.reason}</span>
                    {doc && (
                      <div className="document-meta small">
                        <strong>{doc.filename}</strong>
                        {doc.confidence != null && <> · {Math.round(doc.confidence * 100)}% match</>}
                        {doc.verification.issues.map((issue) => <div key={issue}>{issue}</div>)}
                        <DocumentClassificationDetails doc={doc} />
                      </div>
                    )}
                    {!doc && localDoc && (
                      <div className="document-meta small">
                        <strong>{localDoc.name}</strong>
                        {localDoc.source === 'gmail' && <> · imported from Gmail</>}
                        {localDoc.source === 'manual' && <> · uploaded manually</>}
                      </div>
                    )}
                  </td>
                  <td>{requirement.category}</td>
                  <td>{statusBadgeBackend(doc, localDoc)}</td>
                  <td>
                    {viewerRole !== 'client' && renderUploadButton(requirement.id, doc || localDoc ? 'Replace file' : 'Upload file')}
                    {viewerRole !== 'client' && viewerRole !== 'compliance' && doc && doc.review.status === 'pending' && (
                      <>
                        <button className="button primary" disabled={loading === doc.document_id} onClick={() => reviewBackend(doc.document_id, 'accept')}>
                          Accept
                        </button>
                        <button className="button" disabled={loading === doc.document_id} onClick={() => reviewBackend(doc.document_id, 'reject')}>
                          Request Revision
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            }

            const receivedDoc = receivedByRequirement.get(requirement.id);
            return (
              <tr key={requirement.id}>
                <td>
                  <strong>{requirement.name}</strong><br />
                  <span className="small">{requirement.reason}</span>
                  {receivedDoc && (
                    <div className="document-meta small">
                      <strong>{receivedDoc.name}</strong>
                      {receivedDoc.source === 'email_demo' && <> · imported from email</>}
                    </div>
                  )}
                </td>
                <td>{requirement.category}</td>
                <td>{statusBadgeLocal(receivedDoc)}</td>
                <td>
                  {viewerRole !== 'client' && (
                    <label className="button upload-button">
                      {loading === requirement.id ? (receivedDoc ? 'Replacing...' : 'Uploading...') : receivedDoc ? 'Replace file' : 'Upload file'}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
                        disabled={loading === requirement.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          uploadDocument(requirement.id, file);
                        }}
                      />
                    </label>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {backendMode && unmatchedBackendDocs.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Unmatched attachments</h3>
          <p className="small">These files were received but could not be mapped to a checklist item. Reclassify or reject.</p>
          <table className="table">
            <thead><tr><th>File</th><th>Detected Type</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {unmatchedBackendDocs.map((doc) => (
                <tr key={doc.document_id}>
                  <td>
                    <strong>{doc.filename}</strong>
                    <DocumentClassificationDetails doc={doc} />
                  </td>
                  <td>{doc.doc_type ? formatDocType(doc.doc_type) : 'unknown'}</td>
                  <td>{statusBadgeBackend(doc)}</td>
                  <td>
                    {viewerRole !== 'client' && viewerRole !== 'compliance' && doc.review.status === 'pending' && (
                      <button className="button primary" disabled={loading === doc.document_id} onClick={() => reviewBackend(doc.document_id, 'accept')}>
                        Accept anyway
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
