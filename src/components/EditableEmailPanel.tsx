'use client';

import { useState } from 'react';
import { readResponseError } from '@/lib/http';

export function EditableEmailPanel({
  caseId,
  title,
  text,
  empty,
  field,
  readOnly = false,
}: {
  caseId: string;
  title: string;
  text?: string;
  empty: string;
  field: 'emailDraft' | 'openingEmailDraft';
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState(text || '');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setLoading(true);
    setSaved(false);
    setError('');
    const response = await fetch(`/api/cases/${caseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: draft }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '保存失败'));
      setLoading(false);
      return;
    }
    setLoading(false);
    setSaved(true);
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      {text ? (
        <>
          <textarea className="email-editor" value={draft} onChange={(event) => setDraft(event.target.value)} readOnly={readOnly} />
          {error && <p className="form-error">{error}</p>}
          {!readOnly && (
          <div className="actions">
            <button className="button primary" disabled={loading} onClick={save}>{loading ? 'Saving…' : 'Save Draft'}</button>
            {saved && <span className="small">Saved.</span>}
          </div>
          )}
        </>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}
