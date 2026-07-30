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

  const parsed = draft ? splitEmailDraft(draft, `Re: KYC Follow-up – ${caseData.companyName}`) : null;

  return (
    <div className="card" id="follow-up-email">
      <div className="card-heading">
        <h2>补充文件邮件发送</h2>
        <span className="small">Analyze 后可反复生成并发送</span>
      </div>
      <p className="small">
        根据客户已发送、已 Accept、仍缺及需修改的文件生成补件邮件，并在<strong>原开户邮件线程</strong>中回复。
        每轮收到新材料并完成 Analyze / Accept 后，都可以重新生成并再次发送。
        {threadId ? ` Thread: ${threadId}` : ''}
      </p>
      {!canReply && (
        <p className="small">
          请先在上方通过 Gmail 发送 Opening Email。现在可以先生成补件草稿，开户邮件发送后即可在原线程发送。
        </p>
      )}

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
        placeholder="点击「生成补充文件邮件」后，这里会列出客户仍需补充或修改的材料。"
      />

      {error && <p className="form-error">{error}</p>}
      {!readOnly && (
        <div className="actions">
          <button className="button primary" type="button" disabled={Boolean(loading)} onClick={regenerateDraft}>
            {loading === 'generate' ? '生成中…' : '生成补充文件邮件'}
          </button>
          <button className="button" type="button" disabled={Boolean(loading)} onClick={saveDraft}>
            {loading === 'save' ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="button primary" type="button" disabled={Boolean(loading) || !draft.trim() || !canReply} onClick={replyInThread}>
            {loading === 'send' ? '发送中…' : '在原线程发送'}
          </button>
          {saved && <span className="small">Saved.</span>}
        </div>
      )}
    </div>
  );
}
