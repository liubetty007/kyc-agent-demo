'use client';

import { useState } from 'react';
import type { KYCCase } from '@/lib/kyb/types';

export function CaseActions({ caseData }: { caseData: KYCCase }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function post(action: string) {
    setLoading(action);
    await fetch(`/api/cases/${caseData.id}/${action}`, { method: 'POST' });
    window.location.reload();
  }

  return (
    <div className="actions">
      <button className="button" disabled={Boolean(loading)} onClick={() => post('checklist')}>Regenerate Checklist</button>
      <button className="button" disabled={Boolean(loading)} onClick={() => post('email-ingest')}>Fetch & Analyze Gmail</button>
      <button className="button primary" disabled={Boolean(loading)} onClick={() => post('review')}>Run Agent Review</button>
      <button className="button" disabled={Boolean(loading)} onClick={() => post('email')}>Generate Email Draft</button>
      <button className="button" disabled={Boolean(loading)} onClick={() => post('compliance-pack')}>Generate Compliance Pack</button>
      {loading && <span className="small">Running {loading}…</span>}
    </div>
  );
}
