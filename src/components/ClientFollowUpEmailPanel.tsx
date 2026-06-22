'use client';

import { useState } from 'react';
import { readResponseError } from '@/lib/http';
import type { KYCCase } from '@/lib/kyb/types';

export function ClientFollowUpEmailPanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [draft, setDraft] = useState(caseData.emailDraft || '');
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function generateDraft() {
    setLoading('generate');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/email`, { method: 'POST' });
    const updated = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(updated.error || '生成失败');
      setLoading(null);
      return;
    }
    setDraft(updated.emailDraft || '');
    setLoading(null);
  }

  async function saveDraft() {
    setLoading('save');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailDraft: draft }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '保存失败'));
      setLoading(null);
      return;
    }
    setSaved(true);
    setLoading(null);
  }

  async function sendDraft() {
    setLoading('send');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/client-email-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '发送失败'));
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="card" id="follow-up-email">
      <div className="card-heading">
        <h2>补充资料邮件</h2>
        <span className="small">checklist 后的客户往来邮件</span>
      </div>
      <p>
        这里生成后续补充资料邮件草稿。你可以反复修改、保存，再发给客户。
      </p>
      <textarea
        className="email-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        readOnly={readOnly}
        placeholder="点击生成邮件草稿，或直接编辑已有草稿。"
      />
      {error && <p className="form-error">{error}</p>}
      {!readOnly && (
        <div className="actions">
          <button className="button" type="button" disabled={Boolean(loading)} onClick={generateDraft}>
            {loading === 'generate' ? '生成中…' : 'Generate Email Draft'}
          </button>
          <button className="button" type="button" disabled={Boolean(loading) || !draft.trim()} onClick={saveDraft}>
            {loading === 'save' ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="button primary" type="button" disabled={Boolean(loading) || !draft.trim()} onClick={sendDraft}>
            {loading === 'send' ? 'Sending…' : 'Send to Client'}
          </button>
          {saved && <span className="small">Saved.</span>}
        </div>
      )}
    </div>
  );
}
