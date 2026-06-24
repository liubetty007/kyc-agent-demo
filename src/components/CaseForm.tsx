'use client';

import { useEffect, useState } from 'react';
import { BUSINESS_TYPE_OPTIONS, type BusinessType, type CaseLanguage, type Jurisdiction } from '@/lib/kyb/types';

const jurisdictions: Jurisdiction[] = ['Hong Kong', 'Singapore', 'BVI', 'Cayman', 'United States', 'European countries', 'Other offshore', 'Other countries', 'Mainland China'];
const languages: Array<{ value: CaseLanguage; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];
const CUSTOMER_EMAIL_BOOK_KEY = 'kyc_customer_emails';

function parseEmails(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  ));
}

function formatEmails(emails: string[]): string {
  return emails.join(', ');
}

export function CaseForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [form, setForm] = useState({
    companyName: '',
    contactEmail: '',
    jurisdiction: 'Hong Kong' as Jurisdiction,
    usState: '',
    businessType: 'mining_loan' as BusinessType,
    sourceOfFunds: 'Crypto treasury assets and business income.',
    needsNsBusiness: false,
    language: 'zh' as CaseLanguage,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOMER_EMAIL_BOOK_KEY);
      if (raw) setSavedEmails(parseEmails(JSON.parse(raw).join(',')));
    } catch {
      setSavedEmails([]);
    }
  }, []);

  function rememberEmails(value: string) {
    const next = Array.from(new Set([...savedEmails, ...parseEmails(value)])).sort();
    setSavedEmails(next);
    window.localStorage.setItem(CUSTOMER_EMAIL_BOOK_KEY, JSON.stringify(next));
  }

  function toggleSavedEmail(email: string) {
    const current = parseEmails(form.contactEmail);
    const next = current.includes(email) ? current.filter((item) => item !== email) : [...current, email];
    setForm({ ...form, contactEmail: formatEmails(next) });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, contactEmail: formatEmails(parseEmails(form.contactEmail)) }),
      });
      const created = await response.json();
      if (!response.ok || !created.id) {
        throw new Error(created.error || 'Unable to create case.');
      }
      rememberEmails(form.contactEmail);
      window.location.href = `/cases/${created.id}`;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create case.');
      setLoading(false);
    }
  }

  return (
    <form className="form card" onSubmit={submit}>
      <label>
        Company Name
        <input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="ABC Trading Ltd" />
      </label>
      <label>
        Contact Emails
        <textarea
          value={form.contactEmail}
          onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          placeholder="client@example.com, ops@example.com"
          rows={2}
        />
      </label>
      {savedEmails.length > 0 && (
        <div className="saved-email-picker">
          <span className="small">Saved customer emails</span>
          <div className="saved-email-options">
            {savedEmails.map((email) => (
              <label key={email}>
                <input
                  type="checkbox"
                  checked={parseEmails(form.contactEmail).includes(email)}
                  onChange={() => toggleSavedEmail(email)}
                />
                {email}
              </label>
            ))}
          </div>
        </div>
      )}
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
          {BUSINESS_TYPE_OPTIONS.map((type) => (
            <option key={type.value} value={type.value} title={type.hint}>{type.label}</option>
          ))}
        </select>
      </label>
      <div className="grid two">
        <label>
          Language
          <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as CaseLanguage })}>
            {languages.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24 }}>
          <input
            type="checkbox"
            checked={form.needsNsBusiness}
            onChange={(e) => setForm({ ...form, needsNsBusiness: e.target.checked })}
          />
          Need NS business
        </label>
      </div>
      <label>
        Source of Funds / Business Notes
        <textarea value={form.sourceOfFunds} onChange={(e) => setForm({ ...form, sourceOfFunds: e.target.value })} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" disabled={loading}>{loading ? 'Creating…' : 'Create Case + Generate Checklist'}</button>
    </form>
  );
}
