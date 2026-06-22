'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { readResponseError } from '@/lib/http';
import type { KYCCase } from '@/lib/kyb/types';

type OpeningAttachment = {
  id: string;
  name: string;
  objectName: string;
  contentType?: string;
  size?: number;
  source: 'standard' | 'uploaded';
  packageId?: string;
  packageName?: string;
};

type OpeningAttachmentPackage = {
  id: string;
  name: string;
  description: string;
  defaultSelected: boolean;
  attachments: OpeningAttachment[];
};

function formatBytes(value?: number): string {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

export function OpeningEmailPanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [draft, setDraft] = useState(caseData.openingEmailDraft || '');
  const [sentAt, setSentAt] = useState(caseData.openingEmailSentAt);
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [standardAttachments, setStandardAttachments] = useState<OpeningAttachment[]>([]);
  const [attachmentPackages, setAttachmentPackages] = useState<OpeningAttachmentPackage[]>([]);
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
      const packages = body.packages || [];
      setStandardAttachments(standard);
      setAttachmentPackages(packages);
      const defaultAttachments = packages.length
        ? packages
          .filter((item: OpeningAttachmentPackage) => item.defaultSelected)
          .flatMap((item: OpeningAttachmentPackage) => item.attachments)
        : standard;
      setSelectedIds((current) => new Set([...current, ...defaultAttachments.map((attachment: OpeningAttachment) => attachment.id)]));
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

  function packageSelected(attachmentPackage: OpeningAttachmentPackage): boolean {
    return attachmentPackage.attachments.length > 0 && attachmentPackage.attachments.every((attachment) => selectedIds.has(attachment.id));
  }

  function togglePackage(attachmentPackage: OpeningAttachmentPackage) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = attachmentPackage.attachments.every((attachment) => next.has(attachment.id));
      for (const attachment of attachmentPackage.attachments) {
        if (allSelected) next.delete(attachment.id);
        else next.add(attachment.id);
      }
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
    if (!isBackendCaseId(caseData.id)) {
      alert('This demo case cannot send via backend. Please create a new case from "New Case".');
      return;
    }

    setLoading('send');
    await save();
    const response = await fetch(`/api/cases/${caseData.id}/opening-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_demo' }),
    });
    if (!response.ok) {
      alert(await readResponseError(response, 'Demo send failed.'));
      setLoading(null);
      return;
    }
    const updated = await response.json();
    setSentAt(updated.openingEmailSentAt);
    setLoading(null);
  }

  async function realSend() {
    if (!isBackendCaseId(caseData.id)) {
      alert('This demo case cannot send via backend. Please create a new case from "New Case".');
      return;
    }
    if (sentAt && !window.confirm('开户邮件已发送过。再次发送会在同一 Gmail 线程里追加一封邮件。确定要继续吗？')) {
      return;
    }

    setLoading('real-send');
    await save();
    const response = await fetch(`/api/cases/${caseData.id}/opening-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_real', attachments: selectedAttachments }),
    });
    if (!response.ok) {
      alert(await readResponseError(response, 'Gmail send failed.'));
      setLoading(null);
      return;
    }
    const updated = await response.json();
    setSentAt(updated.openingEmailSentAt);
    setLoading(null);
  }

  return (
    <div className="card">
      <div className="card-heading">
        <h2>Opening Email</h2>
        <Link className="small" href="#case-details">Edit case details →</Link>
      </div>
      <p>Prepare and send the opening email to the client. Use Gmail send only after the draft has been reviewed by KYC Team.</p>
      {!draft ? (
        readOnly ? <p className="small">No opening email draft yet.</p> : (
        <button className="button primary" disabled={Boolean(loading)} onClick={generate}>Generate Opening Email</button>
        )
      ) : (
        <>
          <textarea className="email-editor" value={draft} onChange={(event) => setDraft(event.target.value)} readOnly={readOnly} />
          {!readOnly && (
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
              {attachmentPackages.length ? (
                attachmentPackages.map((attachmentPackage) => (
                  <div className="attachment-package" key={attachmentPackage.id}>
                    <label className="attachment-package-heading">
                      <input
                        type="checkbox"
                        checked={packageSelected(attachmentPackage)}
                        onChange={() => togglePackage(attachmentPackage)}
                      />
                      <span>
                        <strong>{attachmentPackage.name}</strong>
                        <small>{attachmentPackage.description} · {attachmentPackage.attachments.length} files</small>
                      </span>
                    </label>
                    <div className="attachment-package-files">
                      {attachmentPackage.attachments.map((attachment) => (
                        <label className="attachment-row compact" key={attachment.id}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(attachment.id)}
                            onChange={() => toggleAttachment(attachment.id)}
                          />
                          <span>
                            <strong>{attachment.name}</strong>
                            <small>Google Drive file{attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              ) : standardAttachments.length ? (
                standardAttachments.map((attachment) => (
                  <label className="attachment-row" key={attachment.id}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(attachment.id)}
                      onChange={() => toggleAttachment(attachment.id)}
                    />
                    <span>
                      <strong>{attachment.name}</strong>
                      <small>{attachment.source === 'standard' ? 'Standard file' : 'Uploaded for this email'}{attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}</small>
                    </span>
                  </label>
                ))
              ) : (
                <p className="small">No standard attachments found in Google Drive.</p>
              )}
              {uploadedAttachments.map((attachment) => (
                <label className="attachment-row" key={attachment.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(attachment.id)}
                    onChange={() => toggleAttachment(attachment.id)}
                  />
                  <span>
                    <strong>{attachment.name}</strong>
                    <small>Uploaded for this email{attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
          )}
          {!readOnly && (
          <div className="actions">
            <button className="button" disabled={Boolean(loading)} onClick={save}>{loading === 'save' ? 'Saving…' : 'Save Draft'}</button>
            <button className="button primary" disabled={Boolean(loading)} onClick={demoSend}>{loading === 'send' ? 'Sending…' : 'Demo Send'}</button>
            <button className="button primary" disabled={Boolean(loading)} onClick={realSend}>{loading === 'real-send' ? 'Sending Gmail…' : 'Send via Gmail'}</button>
            {saved && <span className="small">Saved.</span>}
            {sentAt && <span className="badge accepted">Demo sent: {new Date(sentAt).toLocaleString()}</span>}
          </div>
          )}
          {readOnly && sentAt && <span className="badge accepted">Sent: {new Date(sentAt).toLocaleString()}</span>}
        </>
      )}
    </div>
  );
}
