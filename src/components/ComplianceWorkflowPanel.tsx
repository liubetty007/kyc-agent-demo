'use client';

import { useEffect, useState } from 'react';
import { readResponseError } from '@/lib/http';
import { complianceReplyMessages, openingEmailSubject } from '@/lib/kyb/caseMailThreads';
import { extractNewReplyText } from '@/lib/kyb/complianceReplyText';
import { canSubmitCaseToCompliance } from '@/lib/kyb/complianceSubmit';
import { COMPLIANCE_OUTCOME_LABELS } from '@/lib/kyb/complianceReview';
import type { ClientEmailAttachmentRef } from '@/lib/kyb/documentStorage';
import { splitEmailDraft } from '@/lib/kyb/gmail';
import { defaultComplianceEmail } from '@/lib/kyb/mailbox';
import type { KYCCase } from '@/lib/kyb/types';
import type { ComplianceDecisionOutcome } from '@/lib/kyb/types';
import {
  complianceNeedsClientAction,
  currentComplianceRound,
  feedbackAfterCurrentSubmission,
  hasClientMaterialAfterFollowUp,
} from '@/lib/kyb/complianceWorkflow';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

const RISK_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  unclear: '待人工判断',
} as const;

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
  const [decisionOutcome, setDecisionOutcome] = useState<ComplianceDecisionOutcome>('request_more_info');
  const [decisionNote, setDecisionNote] = useState('');

  const replies = complianceReplyMessages(caseData);
  const canSubmit = canSubmitCaseToCompliance(caseData.status);
  const currentRound = currentComplianceRound(caseData);
  const currentFeedback = feedbackAfterCurrentSubmission(caseData);
  const started = Boolean(currentRound || complianceDraft);
  const decided = caseData.status === 'approved' || caseData.status === 'rejected';
  const roundDraftReady = currentRound?.status === 'draft';
  const roundSent = currentRound?.status === 'sent' && Boolean(currentRound.emailSentAt);
  const needsClientAction = complianceNeedsClientAction(caseData);
  const canShowDecision = canDecide && roundSent && !decided;
  const canManageClientEmail = kycCanOperate && needsClientAction && !decided;
  const clientFollowUpSent = Boolean(
    currentRound?.clientFollowUpSentAt
      && currentFeedback
      && new Date(currentRound.clientFollowUpSentAt).getTime() >= new Date(currentFeedback.at).getTime(),
  );
  const newClientMaterial = hasClientMaterialAfterFollowUp(caseData);

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

  async function saveClientDraft(mode: 'save-client' | 'send-client' = 'save-client'): Promise<boolean> {
    setLoading(mode);
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailDraft: clientDraft }),
    });
    if (!response.ok) {
      setError(await readResponseError(response, '保存失败'));
      setLoading(null);
      return false;
    }
    if (mode === 'save-client') setLoading(null);
    return true;
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
    setError('');
    if (!await saveClientDraft('send-client')) return;
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

  async function submitComplianceDecision() {
    if (!decisionNote.trim()) {
      setError('请填写本轮合规反馈，KYC 将据此跟进客户或记录最终结论。');
      return;
    }
    const finalOutcome = decisionOutcome === 'approved' || decisionOutcome === 'rejected';
    const confirmed = window.confirm(
      finalOutcome
        ? `确认提交“${COMPLIANCE_OUTCOME_LABELS[decisionOutcome]}”作为最终结论？${decisionOutcome === 'approved' ? '\n通过后 Case 将结案，并尝试在原线程通知客户。' : '\n拒绝后 Case 将作为最终拒绝关闭。'}`
        : `确认将第 ${currentRound?.round || 1} 轮退回 KYC：${COMPLIANCE_OUTCOME_LABELS[decisionOutcome]}？`,
    );
    if (!confirmed) return;

    setLoading('decision');
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: decisionOutcome, note: decisionNote }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || '操作失败');
      setLoading(null);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (data.clientEmailError) alert(data.clientEmailError);
    window.location.reload();
  }

  return (
    <div className="card compliance-workflow-card">
      <h2>合规</h2>

      {!decided && currentRound && (
        <p className="small">
          <span className="badge medium">当前第 {currentRound.round} 轮</span>{' '}
          {roundDraftReady
            ? 'KYC 已生成送审草稿，待发送。'
            : roundSent
              ? '材料已发送合规，等待本轮审批。'
              : needsClientAction
                ? '合规已要求补件，待 KYC 跟进客户并重新送审。'
                : '本轮合规反馈已记录。'}
        </p>
      )}

      {decided && (
        <>
          <p className="small">
            <span className={`badge ${caseData.status === 'approved' ? 'accepted' : 'prohibited'}`}>
              {caseData.status === 'approved'
                ? caseData.clientApprovalEmailSentAt
                  ? '已通过 — 开户成功邮件已发送给客户'
                  : '已通过 — 客户通知待人工补发'
                : '已拒绝'}
            </span>
          </p>
          {caseData.clientApprovalEmailError && <p className="form-error">{caseData.clientApprovalEmailError}</p>}
        </>
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
          {kycCanOperate && roundDraftReady && (
            <section className="workflow-section workflow-section-tight">
              <div className="card-heading">
                <h3>发给合规的邮件</h3>
                <span className="badge medium small">第 {currentRound?.round || 1} 轮待发送</span>
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
                <button className="button primary" type="button" disabled={Boolean(loading) || !complianceTo.trim()} onClick={sendComplianceEmail}>
                  {loading === 'send-compliance' ? '发送中…' : '发送给合规'}
                </button>
              </div>
            </section>
          )}

          {(roundSent || currentFeedback || replies.length > 0) && <section className="workflow-section workflow-section-tight">
            <div className="card-heading">
              <h3>合规回复</h3>
              {(kycCanOperate || canDecide) && roundSent && (
                <button className="button" type="button" disabled={Boolean(loading)} onClick={fetchComplianceReply}>
                  {loading === 'ingest' ? '抓取中…' : '抓取回复'}
                </button>
              )}
            </div>
            {caseData.complianceReplyAnalysis && (
              <div className="compliance-reply-result">
                <span className="badge accepted">
                  结果：{caseData.complianceReplyAnalysis.outcome === 'unclear'
                    ? '待人工判断'
                    : COMPLIANCE_OUTCOME_LABELS[caseData.complianceReplyAnalysis.outcome]}
                </span>
                <span className={`badge ${caseData.complianceReplyAnalysis.riskLevel === 'high' ? 'prohibited' : caseData.complianceReplyAnalysis.riskLevel === 'low' ? 'accepted' : 'medium'}`}>
                  风险：{RISK_LABELS[caseData.complianceReplyAnalysis.riskLevel]}
                </span>
                <p className="small">{caseData.complianceReplyAnalysis.recommendedAction}</p>
              </div>
            )}
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
              <p className="small">暂无本轮邮件回复。合规人员也可以在下方直接提交本轮审批反馈。</p>
            )}
          </section>}

          {canManageClientEmail && (
            <section className="workflow-section workflow-section-tight">
              <div className="card-heading">
                <h3>发给客户的邮件</h3>
                <button className="button" type="button" disabled={Boolean(loading)} onClick={generateClientDraft}>
                  {loading === 'client-draft' ? '生成中…' : '根据合规回复生成草稿'}
                </button>
              </div>
              <p className="small">KYC 根据当前一轮合规意见整理所需材料，人工确认后在原客户邮件线程发送。</p>
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
                  <button className="button" type="button" disabled={Boolean(loading)} onClick={() => void saveClientDraft()}>
                    {loading === 'save-client' ? '保存中…' : '保存草稿'}
                  </button>
                  <button className="button primary" type="button" disabled={Boolean(loading)} onClick={sendClientEmail}>
                    {loading === 'send-client' ? '发送中…' : '发送给客户'}
                  </button>
                </div>
              )}
            </section>
          )}

          {kycCanOperate && needsClientAction && clientFollowUpSent && !newClientMaterial && (
            <section className="workflow-section workflow-section-tight">
              <h3>等待客户补件</h3>
              <p className="small">补件邮件已发送。收到客户新材料后，请先抓取邮件、检查文件并将合格材料标记为 Accept。</p>
            </section>
          )}

          {kycCanOperate && needsClientAction && clientFollowUpSent && newClientMaterial && (
            <section className="workflow-section workflow-section-tight">
              <h3>重新提交合规</h3>
              <p className="small">已检测到补件邮件后的客户材料。确认所有必需文件已 Accept 后，生成下一轮合规包；系统会阻止缺件或待审材料被重新送审。</p>
              <div className="actions">
                <button className="button primary" type="button" disabled={Boolean(loading)} onClick={submitToCompliance}>
                  {loading === 'submit' ? '检查并生成中…' : `生成第 ${(currentRound?.round || 0) + 1} 轮合规草稿`}
                </button>
              </div>
            </section>
          )}

          {canShowDecision && (
            <section className="workflow-section workflow-section-tight compliance-decision-section">
              <h3>第 {currentRound?.round || 1} 轮合规审批</h3>
              <p className="small">
                反馈将回到 KYC 工作台。选择补件或 EDD 后，必须由 KYC 跟进客户并创建新一轮送审；只有最终“通过”才会正常结案。
              </p>
              <div className="compliance-outcome-grid">
                {(['request_more_info', 'edd_required', 'approved', 'rejected'] as ComplianceDecisionOutcome[]).map((outcome) => (
                  <label key={outcome} className={`compliance-outcome${decisionOutcome === outcome ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name="compliance-decision"
                      value={outcome}
                      checked={decisionOutcome === outcome}
                      onChange={() => setDecisionOutcome(outcome)}
                    />
                    <span>{COMPLIANCE_OUTCOME_LABELS[outcome]}</span>
                  </label>
                ))}
              </div>
              <label className="compliance-note-label">
                本轮合规反馈
                <textarea
                  className="compliance-note-input"
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  placeholder="请明确列出所需材料、EDD 要求、通过依据或拒绝原因。该内容将提供给 KYC 整理对客邮件。"
                />
              </label>
              <div className="actions">
                <button className="button primary" type="button" disabled={Boolean(loading)} onClick={submitComplianceDecision}>
                  {loading === 'decision' ? '提交中…' : `提交：${COMPLIANCE_OUTCOME_LABELS[decisionOutcome]}`}
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
