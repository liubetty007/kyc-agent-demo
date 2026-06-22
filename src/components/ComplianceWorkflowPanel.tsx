'use client';

import { useEffect, useState } from 'react';
import { readResponseError } from '@/lib/http';
import { complianceReplyMessages, openingEmailSubject } from '@/lib/kyb/caseMailThreads';
import { extractNewReplyText } from '@/lib/kyb/complianceReplyText';
import { canSubmitCaseToCompliance } from '@/lib/kyb/complianceSubmit';
import type { ClientEmailAttachmentRef } from '@/lib/kyb/documentStorage';
import { splitEmailDraft } from '@/lib/kyb/gmail';
import { defaultComplianceEmail } from '@/lib/kyb/mailbox';
import type { KYCCase } from '@/lib/kyb/types';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

async function loadAcceptedAttachmentNames(caseId: string, caseData: KYCCase): Promise<string[]> {
  if (isBackendCaseId(caseId)) {
    const response = await fetch(`/api/cases/${caseId}/backend-documents`);
    if (!response.ok) return [];
    const docs = await response.json() as Array<{ review: { status: string }; filename: string }>;
    return docs.filter((doc) => doc.review.status === 'accepted').map((doc) => doc.filename);
  }
  return caseData.receivedDocuments.filter((doc) => doc.status === 'accepted').map((doc) => doc.name);
}

export function ComplianceWorkflowPanel({
  caseData,
  kycCanOperate = false,
  canDecide = false,
}: {
  caseData: KYCCase;
  kycCanOperate?: boolean;
  canDecide?: boolean;
}) {
  const [complianceDraft, setComplianceDraft] = useState(caseData.complianceEmailDraft || '');
  const [complianceTo, setComplianceTo] = useState(defaultComplianceEmail(caseData));
  const [attachmentNames, setAttachmentNames] = useState<string[]>([]);
  const [clientDraft, setClientDraft] = useState(caseData.emailDraft || '');
  const [clientUploads, setClientUploads] = useState<ClientEmailAttachmentRef[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const replies = complianceReplyMessages(caseData);
  const canSubmit = canSubmitCaseToCompliance(caseData.status);
  const started = Boolean(caseData.complianceSubmittedAt || complianceDraft);
  const decided = caseData.status === 'approved' || caseData.status === 'rejected';
  const canShowDecision = canDecide && Boolean(caseData.complianceEmailSentAt) && !decided;
  const canManageClientEmail = (kycCanOperate || canDecide) && replies.length > 0 && !decided;

  useEffect(() => {
    if (!started) return;
    void loadAcceptedAttachmentNames(caseData.id, caseData).then(setAttachmentNames);
  }, [caseData.id, caseData.receivedDocuments, started]);

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
    const names = attachmentNames.length
      ? attachmentNames
      : await loadAcceptedAttachmentNames(caseData.id, caseData);
    if (!names.length && !window.confirm('没有 Accepted 附件，邮件将不带附件。继续发送？')) {
      setLoading(null);
      return;
    }
    const response = await fetch(`/api/cases/${caseData.id}/compliance-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_real',
        draft: complianceDraft,
        toEmail: complianceTo.trim(),
      }),
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

  async function saveClientDraft() {
    setLoading('save-client');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailDraft: clientDraft }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '保存失败'));
      setLoading(null);
      return;
    }
    setLoading(null);
  }

  async function uploadClientAttachment(file?: File) {
    if (!file) return;
    setLoading('upload');
    setError('');
    const form = new FormData();
    form.set('file', file);
    const response = await fetch(`/api/cases/${caseData.id}/client-email-attachments`, { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || '上传失败');
      setLoading(null);
      return;
    }
    if (data.attachment) setClientUploads((current) => [...current, data.attachment as ClientEmailAttachmentRef]);
    setLoading(null);
  }

  async function sendClientEmail() {
    setLoading('send-client');
    setError('');
    await saveClientDraft();
    const response = await fetch(`/api/cases/${caseData.id}/client-email-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        draft: clientDraft,
        attachMissingTemplates: false,
        uploadedObjectNames: clientUploads.map((item) => item.objectName),
      }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '发送失败'));
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  async function approveCase() {
    const confirmed = window.confirm(
      '确认通过该案件？\n\n点击「确定」后，系统将自动在开户邮件线程中向客户发送 KYC 已通过 / 开户成功的通知邮件。此操作不可撤销。',
    );
    if (!confirmed) return;

    setLoading('approved');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'approved' }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || '操作失败');
      setLoading(null);
      return;
    }
    window.location.reload();
  }

  async function rejectCase() {
    const confirmed = window.confirm('确认不通过该案件？');
    if (!confirmed) return;

    setLoading('rejected');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: 'rejected' }),
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

      {decided && (
        <p className="small">
          <span className={`badge ${caseData.status === 'approved' ? 'accepted' : 'prohibited'}`}>
            {caseData.status === 'approved' ? '已通过 — 开户成功邮件已发送给客户' : '已拒绝'}
          </span>
        </p>
      )}

      {kycCanOperate && !started && canSubmit && (
        <div className="actions">
          <button className="button primary" type="button" disabled={Boolean(loading)} onClick={submitToCompliance}>
            {loading === 'submit' ? '生成中…' : '生成合规邮件草稿'}
          </button>
        </div>
      )}

      {started && (
        <>
          {kycCanOperate && (
            <section className="workflow-section workflow-section-tight">
              <div className="card-heading">
                <h3>发给合规的邮件</h3>
                {caseData.complianceEmailSentAt && (
                  <span className="badge accepted small">已发送</span>
                )}
              </div>

              <label className="small" style={{ display: 'block', marginBottom: 12 }}>
                <strong>收件人</strong>
                <input
                  type="email"
                  value={complianceTo}
                  onChange={(event) => setComplianceTo(event.target.value)}
                  placeholder="liubetty007@gmail.com"
                  style={{ display: 'block', width: '100%', marginTop: 6 }}
                />
              </label>

              <p className="small">
                <strong>邮件附件：</strong>
                {attachmentNames.length
                  ? `将附带 ${attachmentNames.length} 个已 Accept 的文件 — ${attachmentNames.join('、')}`
                  : '暂无已 Accept 的文件，发送前请先在 KYC 页面 Accept 客户材料。'}
              </p>

              <textarea
                className="email-editor"
                value={complianceDraft}
                onChange={(event) => setComplianceDraft(event.target.value)}
              />
              <div className="actions">
                {!caseData.complianceSubmittedAt && canSubmit && (
                  <button className="button" type="button" disabled={Boolean(loading)} onClick={submitToCompliance}>
                    重新生成草稿
                  </button>
                )}
                <button className="button primary" type="button" disabled={Boolean(loading) || !complianceTo.trim()} onClick={sendComplianceEmail}>
                  {loading === 'send-compliance' ? '发送中…' : '发送给合规'}
                </button>
              </div>
            </section>
          )}

          <section className="workflow-section workflow-section-tight">
            <div className="card-heading">
              <h3>合规回复</h3>
              {(kycCanOperate || canDecide) && caseData.complianceEmailSentAt && (
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
                  <div className="compliance-history-note">{extractNewReplyText(message.body)}</div>
                </article>
              ))
            ) : (
              <p className="small">暂无回复。可在 Gmail 中查看合规回复后，点击下方按钮确认审批结果。</p>
            )}
          </section>

          {canManageClientEmail && (
            <section className="workflow-section workflow-section-tight">
              <div className="card-heading">
                <h3>发给客户的邮件</h3>
                <button className="button" type="button" disabled={Boolean(loading)} onClick={generateClientDraft}>
                  {loading === 'client-draft' ? '生成中…' : '根据合规回复生成草稿'}
                </button>
              </div>
              <p className="small">仅根据合规回复内容生成，不包含客户已提交/缺失清单。可编辑正文，并可上传附件后发送。</p>
              {clientDraft && (
                <p className="small">
                  <strong>Subject:</strong> {splitEmailDraft(clientDraft, openingEmailSubject(caseData)).subject}
                </p>
              )}
              <textarea
                className="email-editor"
                value={clientDraft}
                onChange={(event) => setClientDraft(event.target.value)}
                placeholder="点击「根据合规回复生成草稿」…"
              />
              <div className="actions" style={{ marginTop: 12 }}>
                <label className="button upload-button">
                  {loading === 'upload' ? '上传中…' : '上传附件'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    disabled={Boolean(loading)}
                    onChange={(event) => {
                      void uploadClientAttachment(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </label>
                {clientUploads.length > 0 && (
                  <span className="small">已选 {clientUploads.length} 个附件：{clientUploads.map((item) => item.name).join('、')}</span>
                )}
              </div>
              {clientDraft && (
                <div className="actions">
                  <button className="button" type="button" disabled={Boolean(loading)} onClick={saveClientDraft}>
                    {loading === 'save-client' ? '保存中…' : '保存草稿'}
                  </button>
                  <button className="button primary" type="button" disabled={Boolean(loading)} onClick={sendClientEmail}>
                    {loading === 'send-client' ? '发送中…' : '发送给客户'}
                  </button>
                </div>
              )}
            </section>
          )}

          {canShowDecision && (
            <section className="workflow-section workflow-section-tight compliance-decision-section">
              <h3>合规审批</h3>
              <p className="small">
                审阅合规邮件回复后，请手动确认结果。点击「通过」将<strong>自动</strong>向客户发送开户成功通知（原开户邮件线程），无需再编辑草稿。
              </p>
              <div className="actions">
                <button className="button primary" type="button" disabled={Boolean(loading)} onClick={approveCase}>
                  {loading === 'approved' ? '处理中…' : '通过'}
                </button>
                <button className="button" type="button" disabled={Boolean(loading)} onClick={rejectCase}>
                  {loading === 'rejected' ? '处理中…' : '不通过'}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
