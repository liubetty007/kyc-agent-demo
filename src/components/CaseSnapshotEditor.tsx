'use client';

import { useState } from 'react';
import type { KYCCase } from '@/lib/kyb/types';

export function CaseSnapshotEditor({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [companyName, setCompanyName] = useState(caseData.companyName);
  const [contactEmail, setContactEmail] = useState(caseData.contactEmail || '');
  const [sourceOfFunds, setSourceOfFunds] = useState(caseData.sourceOfFunds);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setLoading(true);
    setSaved(false);
    await fetch(`/api/cases/${caseData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, contactEmail, sourceOfFunds }),
    });
    setLoading(false);
    setSaved(true);
    window.location.reload();
  }

  return (
    <div className="card" id="case-details">
      <h2>Case Snapshot</h2>
      <div className="form compact-form">
        <label>
          Company Name
          <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} readOnly={readOnly} />
        </label>
        <label>
          Company Registration Place
          <input value={`${caseData.jurisdiction}${caseData.usState ? ` (${caseData.usState})` : ''}`} readOnly />
        </label>
        <label>
          Contact Email
          <input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="client@example.com" readOnly={readOnly} />
        </label>
        <label>
          Source of Funds / Business Notes
          <textarea value={sourceOfFunds} onChange={(event) => setSourceOfFunds(event.target.value)} readOnly={readOnly} />
        </label>
        {!readOnly && (
        <div className="actions">
          <button className="button primary" disabled={loading || !companyName.trim()} onClick={save}>{loading ? 'Saving…' : 'Save Case Details'}</button>
          {saved && <span className="small">Saved.</span>}
        </div>
        )}
      </div>
    </div>
  );
}
