'use client';

import { useEffect, useState } from 'react';
import type { CustomerType, EntityType, KYCCase, RiskRating } from '@/lib/kyb/types';

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
  const [customerType, setCustomerType] = useState<CustomerType>(caseData.customerType || 'new_customer');
  const [entityType, setEntityType] = useState<EntityType>(caseData.entityType || 'limited_company');
  const [riskRating, setRiskRating] = useState<RiskRating>(caseData.riskRating || 'medium');
  const [isFinancialInstitution, setIsFinancialInstitution] = useState(Boolean(caseData.isFinancialInstitution));
  const [managesClientAssets, setManagesClientAssets] = useState(Boolean(caseData.managesClientAssets));
  const [isListedEntity, setIsListedEntity] = useState(Boolean(caseData.isListedEntity));
  const [isLicensedEntity, setIsLicensedEntity] = useState(Boolean(caseData.isLicensedEntity));
  const [passportCtcProvided, setPassportCtcProvided] = useState(Boolean(caseData.passportCtcProvided));
  const [hasThirdPartyFunding, setHasThirdPartyFunding] = useState(Boolean(caseData.hasThirdPartyFunding));
  const [legalExceptionApproved, setLegalExceptionApproved] = useState(Boolean(caseData.legalExceptionApproved));
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
      body: JSON.stringify({
        companyName,
        contactEmail: normalizedContactEmail,
        sourceOfFunds,
        customerType,
        entityType,
        riskRating,
        isFinancialInstitution,
        managesClientAssets,
        isListedEntity,
        isLicensedEntity,
        passportCtcProvided,
        hasThirdPartyFunding,
        legalExceptionApproved,
      }),
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
        <div className="grid two">
          <label>
            Relationship Type
            <select value={customerType} onChange={(event) => setCustomerType(event.target.value as CustomerType)} disabled={readOnly}>
              <option value="new_customer">New customer</option>
              <option value="new_counterparty">New counterparty</option>
            </select>
          </label>
          <label>
            Legal Entity Type
            <select value={entityType} onChange={(event) => setEntityType(event.target.value as EntityType)} disabled={readOnly}>
              <option value="limited_company">Limited company</option>
              <option value="llc">LLC</option>
              <option value="corporation">Corporation</option>
              <option value="limited_partnership">Limited partnership</option>
              <option value="trust">Trust</option>
              <option value="spc_fund">SPC / Fund</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <label>
          Risk Rating
          <select value={riskRating} onChange={(event) => setRiskRating(event.target.value as RiskRating)} disabled={readOnly}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High / EDD</option>
          </select>
        </label>
        <div className="saved-email-options" style={{ marginBottom: 12 }}>
          <label><input type="checkbox" checked={isFinancialInstitution} onChange={(event) => setIsFinancialInstitution(event.target.checked)} disabled={readOnly} /> Financial institution</label>
          <label><input type="checkbox" checked={managesClientAssets} onChange={(event) => setManagesClientAssets(event.target.checked)} disabled={readOnly} /> Manages client/user assets</label>
          <label><input type="checkbox" checked={isListedEntity} onChange={(event) => setIsListedEntity(event.target.checked)} disabled={readOnly} /> Listed entity / eligible subsidiary</label>
          <label><input type="checkbox" checked={isLicensedEntity} onChange={(event) => setIsLicensedEntity(event.target.checked)} disabled={readOnly} /> Licensed entity</label>
          <label><input type="checkbox" checked={passportCtcProvided} onChange={(event) => setPassportCtcProvided(event.target.checked)} disabled={readOnly} /> Passport / ID is certified true copy</label>
          <label><input type="checkbox" checked={hasThirdPartyFunding} onChange={(event) => setHasThirdPartyFunding(event.target.checked)} disabled={readOnly} /> Third-party funding / financing</label>
          {caseData.jurisdiction === 'United States' && (
            <label><input type="checkbox" checked={legalExceptionApproved} onChange={(event) => setLegalExceptionApproved(event.target.checked)} disabled={readOnly} /> US Legal / Compliance exception approved</label>
          )}
        </div>
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
