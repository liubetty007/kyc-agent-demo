'use client';

import { useEffect, useMemo, useState } from 'react';
import type { KYCCase } from '@/lib/kyb/types';

type OpeningAttachment = {
  id: string;
  name: string;
  objectName: string;
  contentType?: string;
  size?: number;
  source: 'standard' | 'uploaded';
};

function formatBytes(value?: number): string {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function OpeningEmailPanel({ caseData }: { caseData: KYCCase }) {
  const [draft, setDraft] = useState(caseData.openingEmailDraft || '');
  const [sentAt, setSentAt] = useState(caseData.openingEmailSentAt);
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [standardAttachments, setStandardAttachments] = useState<OpeningAttachment[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<OpeningAttachment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [attachmentError, setAttachmentError] = useState('');

  const selectedAttachments = useMemo(
    () => [...standardAttachments, ...uploadedAttachments].filter((attachment) => selectedIds.has(attachment.id)),
    [standardAttachments, uploadedAttachments, selectedIds],
  );

  useEffect(() => {
    let alive = true;
    async function loadAttachments() {
      setAttachmentError('');
      const response = await fetch(`/api/cases/${caseData.id}/opening-email/attachments`);
      const body = await response.json();
      if (!alive) return;
      if (!response.ok) {
        setAttachmentError(body.error || 'Could not load standard attachments.');
        return;
      }
      const standard = body.standard || [];
      setStandardAttachments(standard);
      setSelectedIds((current) => new Set([...current, ...standard.map((attachment: OpeningAttachment) => attachment.id)]));
    }
    loadAttachments();
    return () => { alive = false; };
  }, [caseData.id]);

  function toggleAttachment(attachmentId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(attachmentId)) next.delete(attachmentId);
      else next.add(attachmentId);
      return next;
    });
  }

  async function uploadAttachment(file: File) {
    setLoading('upload');
    setAttachmentError('');
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`/api/cases/${caseData.id}/opening-email/attachments`, { method: 'POST', body: form });
    const body = await response.json();
    if (!response.ok) {
      setAttachmentError(body.error || 'Upload failed.');
      setLoading(null);
      return;
    }
    const attachment = body.attachment as OpeningAttachment;
    setUploadedAttachments((current) => [...current, attachment]);
    setSelectedIds((current) => new Set([...current, attachment.id]));
    setLoading(null);
  }

  async function generate() {
    setLoading('generate');
    const response = await fetch(`/api/cases/${caseData.id}/opening-email`, { method: 'POST' });
    const updated = await response.json();
    setDraft(updated.openingEmailDraft || '');
    setSentAt(updated.openingEmailSentAt);
    setLoading(null);
  }

  async function save() {
    setLoading('save');
    setSaved(false);
    await fetch(`/api/cases/${caseData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ openingEmailDraft: draft }),
    });
    setSaved(true);
    setLoading(null);
  }

  async function demoSend() {
    setLoading('send');
    await save();
    const response = await fetch(`/api/cases/${caseData.id}/opening-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_demo' }),
    });
    const updated = await response.json();
    setSentAt(updated.openingEmailSentAt);
    setLoading(null);
  }

  async function realSend() {
    setLoading('real-send');
    await save();
    const response = await fetch(`/api/cases/${caseData.id}/opening-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_real', attachments: selectedAttachments }),
    });
    if (!response.ok) {
      alert((await response.json()).error || 'Gmail send failed.');
      setLoading(null);
      return;
    }
    const updated = await response.json();
    setSentAt(updated.openingEmailSentAt);
    setLoading(null);
  }

  return (
    <div className="card">
      <h2>KYC Email to Client</h2>
      <p>Prepare the opening email for the client. Use Gmail send only after the draft has been reviewed by KYC Team.</p>
      {!draft ? (
        <button className="button primary" disabled={Boolean(loading)} onClick={generate}>Generate Opening Email</button>
      ) : (
        <>
          <textarea className="email-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="attachment-panel">
            <div className="section-title">
              <div>
                <strong>Opening Email Attachments</strong>
                <span>{selectedAttachments.length} selected</span>
              </div>
              <label className="button upload-button">
                {loading === 'upload' ? 'Uploading...' : 'Upload file'}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  disabled={Boolean(loading)}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) uploadAttachment(file);
                  }}
                />
              </label>
            </div>
            {attachmentError && <p className="form-error">{attachmentError}</p>}
            <div className="attachment-list">
              {[...standardAttachments, ...uploadedAttachments].length ? (
                [...standardAttachments, ...uploadedAttachments].map((attachment) => (
                  <label className="attachment-row" key={attachment.id}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(attachment.id)}
                      onChange={() => toggleAttachment(attachment.id)}
                    />
                    <span>
                      <strong>{attachment.name}</strong>
                      <small>{attachment.source === 'standard' ? 'Cloud Storage standard file' : 'Uploaded for this email'}{attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}</small>
                    </span>
                  </label>
                ))
              ) : (
                <p className="small">No standard attachments found under kyc_agent_documents/.</p>
              )}
            </div>
          </div>
          <div className="actions">
            <button className="button" disabled={Boolean(loading)} onClick={save}>{loading === 'save' ? 'Saving…' : 'Save Draft'}</button>
            <button className="button primary" disabled={Boolean(loading)} onClick={demoSend}>{loading === 'send' ? 'Sending…' : 'Demo Send'}</button>
            <button className="button primary" disabled={Boolean(loading)} onClick={realSend}>{loading === 'real-send' ? 'Sending Gmail…' : 'Send via Gmail'}</button>
            {saved && <span className="small">Saved.</span>}
            {sentAt && <span className="badge accepted">Demo sent: {new Date(sentAt).toLocaleString()}</span>}
          </div>
        </>
      )}
    </div>
  );
}
