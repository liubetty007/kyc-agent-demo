'use client';

import { useEffect, useState } from 'react';
import type { KYCCase } from '@/lib/kyb/types';

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

export function CaseSnapshotEditor({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [companyName, setCompanyName] = useState(caseData.companyName);
  const [contactEmail, setContactEmail] = useState(caseData.contactEmail || '');
  const [sourceOfFunds, setSourceOfFunds] = useState(caseData.sourceOfFunds);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

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
    const current = parseEmails(contactEmail);
    const next = current.includes(email) ? current.filter((item) => item !== email) : [...current, email];
    setContactEmail(formatEmails(next));
  }

  async function save() {
    setLoading(true);
    setSaved(false);
    const normalizedContactEmail = formatEmails(parseEmails(contactEmail));
    await fetch(`/api/cases/${caseData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, contactEmail: normalizedContactEmail, sourceOfFunds }),
    });
    rememberEmails(normalizedContactEmail);
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
          Contact Emails
          <textarea
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            placeholder="client@example.com, ops@example.com"
            readOnly={readOnly}
            rows={2}
          />
        </label>
        {!readOnly && savedEmails.length > 0 && (
          <div className="saved-email-picker">
            <span className="small">Saved customer emails</span>
            <div className="saved-email-options">
              {savedEmails.map((email) => (
                <label key={email}>
                  <input
                    type="checkbox"
                    checked={parseEmails(contactEmail).includes(email)}
                    onChange={() => toggleSavedEmail(email)}
                  />
                  {email}
                </label>
              ))}
            </div>
          </div>
        )}
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
