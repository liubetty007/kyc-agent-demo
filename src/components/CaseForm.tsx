'use client';

import { useState } from 'react';
import type { BusinessType, Jurisdiction } from '@/lib/kyb/types';

const jurisdictions: Jurisdiction[] = ['Hong Kong', 'Singapore', 'BVI', 'Cayman', 'United States', 'European countries', 'Other offshore', 'Other countries', 'Mainland China'];
const businessTypes: BusinessType[] = ['normal', 'crypto', 'mining', 'financing', 'crypto_financing', 'other'];

export function CaseForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    contactEmail: '',
    jurisdiction: 'Hong Kong' as Jurisdiction,
    usState: '',
    businessType: 'crypto' as BusinessType,
    sourceOfFunds: 'Crypto treasury assets and business income.',
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const created = await response.json();
    window.location.href = `/cases/${created.id}`;
  }

  return (
    <form className="form card" onSubmit={submit}>
      <label>
        Company Name
        <input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="ABC Trading Ltd" />
      </label>
      <label>
        Contact Email
        <input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="client@example.com" />
      </label>
      <div className="grid two">
        <label>
          Jurisdiction
          <select value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value as Jurisdiction })}>
            {jurisdictions.map((jurisdiction) => <option key={jurisdiction}>{jurisdiction}</option>)}
          </select>
        </label>
        <label>
          US State, if applicable
          <input value={form.usState} onChange={(e) => setForm({ ...form, usState: e.target.value })} placeholder="Delaware" />
        </label>
      </div>
      <label>
        Business Type
        <select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value as BusinessType })}>
          {businessTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <label>
        Source of Funds / Business Notes
        <textarea value={form.sourceOfFunds} onChange={(e) => setForm({ ...form, sourceOfFunds: e.target.value })} />
      </label>
      <button className="button primary" disabled={loading}>{loading ? 'Creating…' : 'Create Case + Generate Checklist'}</button>
    </form>
  );
}
