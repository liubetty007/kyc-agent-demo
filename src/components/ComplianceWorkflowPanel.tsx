'use client';

import { useState } from 'react';
import { readResponseError } from '@/lib/http';
import { complianceReplyMessages } from '@/lib/kyb/caseMailThreads';
import { canSubmitCaseToCompliance } from '@/lib/kyb/complianceSubmit';
import type { KYCCase } from '@/lib/kyb/types';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

export function ComplianceWorkflowPanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [complianceDraft, setComplianceDraft] = useState(caseData.complianceEmailDraft || '');
  const [clientDraft, setClientDraft] = useState(caseData.emailDraft || '');
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const replies = complianceReplyMessages(caseData);
  const canSubmit = canSubmitCaseToCompliance(caseData.status);
  const started = Boolean(caseData.complianceSubmittedAt || complianceDraft);

  async function submitToCompliance() {
    setLoading('submit');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/submit-compliance`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || '提交失败');
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  async function sendComplianceEmail() {
    setLoading('send-compliance');
    setError('');
    const names = isBackendCaseId(caseData.id)
      ? await fetch(`/api/cases/${caseData.id}/backend-documents`)
          .then((r) => (r.ok ? r.json() : []))
          .then((docs: Array<{ review: { status: string }; filename: string }>) =>
            docs.filter((doc) => doc.review.status === 'accepted').map((doc) => doc.filename),
          )
      : caseData.receivedDocuments.filter((doc) => doc.status === 'accepted').map((doc) => doc.name);
    if (!names.length && !window.confirm('没有 Accepted 附件，邮件将不带附件。继续发送？')) {
      setLoading(null);
      return;
    }
    const response = await fetch(`/api/cases/${caseData.id}/compliance-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_real', draft: complianceDraft }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '发送失败'));
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  async function fetchComplianceReply() {
    setLoading('ingest');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-ingest`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || '抓取失败');
      setLoading(null);
      return;
    }
    if (!data.imported) {
      alert('暂无新回复');
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  async function generateClientDraft() {
    setLoading('client-draft');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-client-draft`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || '生成失败');
      setLoading(null);
      return;
    }
    setClientDraft(data.emailDraft || '');
    setLoading(null);
  }

  async function sendClientEmail() {
    setLoading('send-client');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/client-email-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: clientDraft }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '发送失败'));
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  async function recordDecision(outcome: 'approved' | 'rejected') {
    setLoading(outcome);
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, note: '' }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || '操作失败');
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="card compliance-workflow-card">
      <h2>合规</h2>

      {!readOnly && !started && canSubmit && (
        <div className="actions">
          <button className="button primary" type="button" disabled={Boolean(loading)} onClick={submitToCompliance}>
            {loading === 'submit' ? '生成中…' : '生成合规邮件草稿'}
          </button>
        </div>
      )}

      {started && (
        <>
          <section className="workflow-section workflow-section-tight">
            <div className="card-heading">
              <h3>发给合规的邮件</h3>
              {caseData.complianceEmailSentAt && (
                <span className="badge accepted small">已发送</span>
              )}
            </div>
            <textarea
              className="email-editor"
              value={complianceDraft}
              onChange={(event) => setComplianceDraft(event.target.value)}
              readOnly={readOnly}
            />
            {!readOnly && (
              <div className="actions">
                {!caseData.complianceSubmittedAt && canSubmit && (
                  <button className="button" type="button" disabled={Boolean(loading)} onClick={submitToCompliance}>
                    重新生成草稿
                  </button>
                )}
                <button className="button primary" type="button" disabled={Boolean(loading)} onClick={sendComplianceEmail}>
                  {loading === 'send-compliance' ? '发送中…' : '发送给合规'}
                </button>
              </div>
            )}
          </section>

          <section className="workflow-section workflow-section-tight">
            <div className="card-heading">
              <h3>合规回复</h3>
              {!readOnly && caseData.complianceEmailSentAt && (
                <button className="button" type="button" disabled={Boolean(loading)} onClick={fetchComplianceReply}>
                  {loading === 'ingest' ? '抓取中…' : '抓取回复'}
                </button>
              )}
            </div>
            {replies.length ? (
              replies.map((message) => (
                <article key={message.id} className="compliance-reply-block">
                  <p className="small">
                    {message.from} · {new Date(message.createdAt).toLocaleString()}
                  </p>
                  <pre className="compliance-history-note">{message.body}</pre>
                </article>
              ))
            ) : (
              <p className="small">暂无回复</p>
            )}
          </section>

          {replies.length > 0 && (
            <section className="workflow-section workflow-section-tight">
              <div className="card-heading">
                <h3>回复客户的邮件</h3>
                {!readOnly && (
                  <button className="button" type="button" disabled={Boolean(loading)} onClick={generateClientDraft}>
                    {loading === 'client-draft' ? '生成中…' : '根据合规回复生成'}
                  </button>
                )}
              </div>
              <textarea
                className="email-editor"
                value={clientDraft}
                onChange={(event) => setClientDraft(event.target.value)}
                readOnly={readOnly}
                placeholder="根据合规回复生成发给客户的补充说明…"
              />
              {!readOnly && clientDraft && (
                <div className="actions">
                  <button className="button primary" type="button" disabled={Boolean(loading)} onClick={sendClientEmail}>
                    {loading === 'send-client' ? '发送中…' : '发送给客户'}
                  </button>
                </div>
              )}
            </section>
          )}

          {!readOnly && replies.length > 0 && caseData.status !== 'approved' && caseData.status !== 'rejected' && (
            <div className="actions">
              <button className="button primary" type="button" disabled={Boolean(loading)} onClick={() => recordDecision('approved')}>
                通过
              </button>
              <button className="button" type="button" disabled={Boolean(loading)} onClick={() => recordDecision('rejected')}>
                不通过
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
