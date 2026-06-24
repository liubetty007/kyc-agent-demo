'use client';

import { useState } from 'react';
import { readResponseError } from '@/lib/http';
import { openingThreadId } from '@/lib/kyb/caseMailThreads';
import { splitEmailDraft } from '@/lib/kyb/gmail';
import type { KYCCase } from '@/lib/kyb/types';

export function ClientFollowUpEmailPanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [draft, setDraft] = useState(caseData.emailDraft || '');
  const [loading, setLoading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const threadId = openingThreadId(caseData);
  const canReply = Boolean(caseData.openingEmailSentAt || threadId);

  async function saveDraft() {
    setLoading('save');
    setSaved(false);
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

  async function regenerateDraft() {
    setLoading('generate');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/client-email-draft`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || '重新生成失败。');
      setLoading(null);
      return;
    }
    setDraft(data.emailDraft || '');
    setLoading(null);
  }

  async function replyInThread() {
    if (!threadId && !caseData.openingEmailSentAt) {
      alert('请先通过 Gmail 发送开户邮件，再在同一邮件线程里回复客户。');
      return;
    }
    if (!draft.trim()) {
      alert('请先重新生成或填写邮件草稿。');
      return;
    }

    setLoading('send');
    setError('');
    await saveDraft();
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

  if (!canReply) return null;

  const parsed = draft ? splitEmailDraft(draft, `Re: KYC Follow-up – ${caseData.companyName}`) : null;

  return (
    <div className="card" id="follow-up-email">
      <div className="card-heading">
        <h2>补充资料邮件</h2>
        <span className="small">checklist 后的客户往来邮件</span>
      </div>
      <p className="small">
        根据客户已发送文件、已 Accept 文件和仍缺文件，生成跟进邮件，并在<strong>原开户邮件线程</strong>里回复客户。
        发送时会附上开户邮件模板（已 Accept 的类型除外）。
        {threadId ? ` Thread: ${threadId}` : ''}
      </p>

      {parsed && (
        <p className="small">
          <strong>Subject:</strong> {parsed.subject}
        </p>
      )}

      <textarea
        className="email-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        readOnly={readOnly}
        placeholder="点击「重新生成 Follow-up 邮件」后，这里会列出客户已发送、已接受和仍缺的文件。"
      />

      {error && <p className="form-error">{error}</p>}
      {!readOnly && (
        <div className="actions">
          <button className="button primary" type="button" disabled={Boolean(loading)} onClick={regenerateDraft}>
            {loading === 'generate' ? '生成中…' : '重新生成 Follow-up 邮件'}
          </button>
          <button className="button" type="button" disabled={Boolean(loading)} onClick={saveDraft}>
            {loading === 'save' ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="button primary" type="button" disabled={Boolean(loading) || !draft.trim()} onClick={replyInThread}>
            {loading === 'send' ? '发送中…' : 'Reply in Thread'}
          </button>
          {saved && <span className="small">Saved.</span>}
        </div>
      )}
    </div>
  );
}
