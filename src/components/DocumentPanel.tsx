'use client';

import { useState } from 'react';
import type { KYCCase, ReceivedDocument } from '@/lib/kyb/types';

export function DocumentPanel({ caseData, viewerRole }: { caseData: KYCCase; viewerRole: string }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function upsertDocument(doc: Partial<ReceivedDocument> & { requirementId: string; name: string }) {
    setLoading(doc.requirementId);
    await fetch(`/api/cases/${caseData.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    window.location.reload();
  }

  async function markReceived(requirementId: string, name: string, issueDate?: string) {
    await upsertDocument({ requirementId, name, status: 'accepted', issueDate, source: 'manual' });
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

  async function acceptDocument(doc: ReceivedDocument) {
    await upsertDocument({ ...doc, status: 'accepted', notes: `${doc.notes || ''} Accepted by KYC Team`.trim() });
  }

  async function rejectDocument(doc: ReceivedDocument) {
    await upsertDocument({ ...doc, status: 'invalid', notes: `${doc.notes || ''} Revision requested by KYC Team.`.trim() });
  }

  const receivedByRequirement = new Map(caseData.receivedDocuments.map((doc) => [doc.requirementId, doc]));

  function statusBadge(doc?: ReceivedDocument) {
    if (!doc) return <span className="badge medium">missing</span>;
    if (doc.status === 'needs_review') return <span className="badge needs-review">pending review</span>;
    if (doc.status === 'invalid') return <span className="badge prohibited">invalid</span>;
    return <span className="badge accepted">{doc.status}</span>;
  }

  return (
    <div className="card">
      <h2>Document Checklist</h2>
      <p>Demo mode: click “Fetch Email Materials” to auto-stage email attachments for KYC review, or “Mark received” to simulate manual upload/classification.</p>
      <table className="table">
        <thead><tr><th>Document</th><th>Category</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {(caseData.checklist || []).map((requirement) => {
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
                      {receivedDoc.fromEmail && <> · {receivedDoc.fromEmail}</>}
                      {receivedDoc.emailSubject && <><br />Subject: {receivedDoc.emailSubject}</>}
                      {receivedDoc.notes && <><br />{receivedDoc.notes}</>}
                      {receivedDoc.storageObject && <><br /><a className="document-link" href={`/api/cases/${caseData.id}/documents/${receivedDoc.id}/download`} target="_blank">View file</a></>}
                    </div>
                  )}
                </td>
                <td>{requirement.category}</td>
                <td>{statusBadge(receivedDoc)}</td>
                <td>
                  {!receivedDoc && (
                    <label className="button upload-button">
                      {loading === requirement.id ? 'Uploading...' : 'Upload file'}
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={loading === requirement.id} onChange={(event) => uploadDocument(requirement.id, event.target.files?.[0])} />
                    </label>
                  )}
                  {viewerRole !== 'client' && receivedDoc?.status === 'needs_review' && (
                    <>
                      <button className="button primary" disabled={loading === requirement.id} onClick={() => acceptDocument(receivedDoc)}>
                        Accept
                      </button>
                      <button className="button" disabled={loading === requirement.id} onClick={() => rejectDocument(receivedDoc)}>
                        Request Revision
                      </button>
                    </>
                  )}
                  {viewerRole !== 'client' && receivedDoc?.status === 'accepted' && (
                    <button className="button" disabled={loading === requirement.id} onClick={() => rejectDocument(receivedDoc)}>
                      Request Revision
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
