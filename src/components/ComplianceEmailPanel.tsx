'use client';

import { useState } from 'react';
import type { KYCCase } from '@/lib/kyb/types';

export function ComplianceEmailPanel({ caseData }: { caseData: KYCCase }) {
  const [draft, setDraft] = useState(caseData.complianceEmailDraft || '');
  const [sentAt, setSentAt] = useState(caseData.complianceEmailSentAt);
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function generate() {
    setLoading('generate');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-email`, { method: 'POST' });
    const updated = await response.json();
    setDraft(updated.complianceEmailDraft || '');
    setSentAt(updated.complianceEmailSentAt);
    setLoading(null);
  }

  async function save() {
    setLoading('save');
    setSaved(false);
    await fetch(`/api/cases/${caseData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complianceEmailDraft: draft }),
    });
    setSaved(true);
    setLoading(null);
  }

  async function demoSend() {
    setLoading('send');
    await save();
    const response = await fetch(`/api/cases/${caseData.id}/compliance-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_demo' }),
    });
    const updated = await response.json();
    setSentAt(updated.complianceEmailSentAt);
    setLoading(null);
  }

  return (
    <div className="card">
      <h2>Compliance Team Review Email</h2>
          <p className="small">KYC 初审：文件已 Accept 后，点击 Demo Send to Compliance 送合规审批。</p>
      {!draft ? (
        <button className="button primary" disabled={Boolean(loading)} onClick={generate}>Generate Compliance Email</button>
      ) : (
        <>
          <textarea className="email-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="actions">
            <button className="button" disabled={Boolean(loading)} onClick={save}>{loading === 'save' ? 'Saving…' : 'Save Draft'}</button>
            <button className="button primary" disabled={Boolean(loading)} onClick={demoSend}>{loading === 'send' ? 'Sending…' : 'Demo Send to Compliance'}</button>
            {saved && <span className="small">Saved.</span>}
            {sentAt && <span className="badge accepted">Demo sent: {new Date(sentAt).toLocaleString()}</span>}
          </div>
        </>
      )}
    </div>
  );
}
