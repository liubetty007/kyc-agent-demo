'use client';

import { useState } from 'react';
import type { KYCCase } from '@/lib/kyb/types';

export function OpeningEmailPanel({ caseData }: { caseData: KYCCase }) {
  const [draft, setDraft] = useState(caseData.openingEmailDraft || '');
  const [sentAt, setSentAt] = useState(caseData.openingEmailSentAt);
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="card">
      <h2>KYC Email to Client</h2>
      <p>Demo mode: prepare the opening email for the client. “Demo Send” records a sent timestamp only and does not send a real email.</p>
      {!draft ? (
        <button className="button primary" disabled={Boolean(loading)} onClick={generate}>Generate Opening Email</button>
      ) : (
        <>
          <textarea className="email-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="actions">
            <button className="button" disabled={Boolean(loading)} onClick={save}>{loading === 'save' ? 'Saving…' : 'Save Draft'}</button>
            <button className="button primary" disabled={Boolean(loading)} onClick={demoSend}>{loading === 'send' ? 'Sending…' : 'Demo Send'}</button>
            {saved && <span className="small">Saved.</span>}
            {sentAt && <span className="badge accepted">Demo sent: {new Date(sentAt).toLocaleString()}</span>}
          </div>
        </>
      )}
    </div>
  );
}
