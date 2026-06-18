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
          <div><strong>Method:</strong> {method === 'llm' ? 'LLM (Claude)' : 'Keyword rules'}</div>
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
    await fetch(`/api/cases/${caseData.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
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

  function docForRequirement(requirementId: string): BackendDocument | undefined {
    const matches = backendDocs.filter((doc) => doc.doc_type === requirementId);
    if (!matches.length) return undefined;
    return (
      matches.find((doc) => doc.review.status === 'accepted')
      || matches.find((doc) => doc.review.status === 'pending')
      || matches[0]
    );
  }

  function statusBadgeBackend(doc?: BackendDocument) {
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

  return (
    <div className="card">
      <h2>Document Checklist</h2>
      <p>
        {backendMode
          ? 'Files from client replies are auto-classified. Accept a document to mark the checklist item as received.'
          : 'Click “Fetch Client Reply” to import attachments, or upload files manually.'}
      </p>

      {backendMode && backendChecklist && (
        <div className="small" style={{ marginBottom: 12 }}>
          <strong>Accepted:</strong> {backendChecklist.received_doc_types.map(formatDocType).join(', ') || 'none'}
          <br />
          <strong>Pending review:</strong> {backendChecklist.pending_doc_types.map(formatDocType).join(', ') || 'none'}
          <br />
          <strong>Still missing:</strong> {backendChecklist.missing_required.map(formatDocType).join(', ') || 'none'}
        </div>
      )}

      <table className="table">
        <thead><tr><th>Document</th><th>Category</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {(caseData.checklist || []).map((requirement) => {
            if (backendMode) {
              const doc = docForRequirement(requirement.id);
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
                  </td>
                  <td>{requirement.category}</td>
                  <td>{statusBadgeBackend(doc)}</td>
                  <td>
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
                  {!receivedDoc && (
                    <label className="button upload-button">
                      {loading === requirement.id ? 'Uploading...' : 'Upload file'}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={loading === requirement.id} onChange={(event) => uploadDocument(requirement.id, event.target.files?.[0])} />
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
