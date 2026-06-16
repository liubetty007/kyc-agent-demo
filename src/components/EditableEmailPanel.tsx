'use client';

import { useState } from 'react';

export function EditableEmailPanel({ caseId, title, text, empty, field }: { caseId: string; title: string; text?: string; empty: string; field: 'emailDraft' | 'openingEmailDraft' }) {
  const [draft, setDraft] = useState(text || '');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setLoading(true);
    setSaved(false);
    await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: draft }),
    });
    setLoading(false);
    setSaved(true);
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      {text ? (
        <>
          <textarea className="email-editor" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className="actions">
            <button className="button primary" disabled={loading} onClick={save}>{loading ? 'Saving…' : 'Save Draft'}</button>
            {saved && <span className="small">Saved.</span>}
          </div>
        </>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}
