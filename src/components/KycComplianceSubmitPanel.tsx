'use client';

import Link from 'next/link';
import { useState } from 'react';
import { hasComplianceReply, wasSubmittedToCompliance } from '@/lib/kyb/caseViews';
import { canSubmitCaseToCompliance } from '@/lib/kyb/complianceSubmit';
import { COMPLIANCE_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import type { KYCCase } from '@/lib/kyb/types';

export function KycComplianceSubmitPanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [loading, setLoading] = useState<'draft' | 'send' | null>(null);
  const [error, setError] = useState('');
  const [sentAt, setSentAt] = useState(caseData.complianceEmailSentAt);

  const hasReply = hasComplianceReply(caseData);
  const submitted = wasSubmittedToCompliance(caseData);
  const canSubmit = canSubmitCaseToCompliance(caseData.status);
  const draftReady = Boolean(caseData.complianceEmailDraft);

  if (hasReply) return null;

  async function prepareDraft() {
    setLoading('draft');
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

  async function sendToCompliance() {
    setLoading('send');
    setError('');

    const submitResponse = await fetch(`/api/cases/${caseData.id}/submit-compliance`, { method: 'POST' });
    const submitData = await submitResponse.json().catch(() => ({}));
    if (!submitResponse.ok) {
      setError(submitData.error || '生成合规包失败');
      setLoading(null);
      return;
    }

    const sendResponse = await fetch(`/api/cases/${caseData.id}/compliance-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_real',
        draft: submitData.case?.complianceEmailDraft,
        toEmail: COMPLIANCE_TEAM_EMAIL,
      }),
    });
    const sendData = await sendResponse.json().catch(() => ({}));
    if (!sendResponse.ok) {
      setError(sendData.error || '发送合规邮件失败');
      setLoading(null);
      return;
    }

    setSentAt(sendData.complianceEmailSentAt);
    alert(`已发送给合规：${COMPLIANCE_TEAM_EMAIL}\n已 Accept 的客户文件会打包为 zip 附件发送。`);
    window.location.reload();
  }

  if (submitted) {
    return (
      <div className="card submit-compliance-card">
        <div className="card-heading">
          <h2>送审合规</h2>
          <Link className="small" href={`/cases/${caseData.id}/compliance`}>打开合规页面 →</Link>
        </div>
        <p className="small">
          {sentAt
            ? `已发送合规邮件至 ${COMPLIANCE_TEAM_EMAIL} · ${new Date(sentAt).toLocaleString()}`
            : draftReady
              ? `合规邮件草稿已生成，可发送至 ${COMPLIANCE_TEAM_EMAIL}。`
              : '已提交合规，等待处理。'}
        </p>
        {!readOnly && !sentAt && (
          <div className="actions">
            <button className="button primary" type="button" disabled={Boolean(loading)} onClick={sendToCompliance}>
              {loading === 'send' ? '发送中…' : '发送给合规'}
            </button>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  if (readOnly || !canSubmit) return null;

  return (
    <div className="card submit-compliance-card">
      <h2>送审合规</h2>
      <p className="small">
        生成合规邮件和 Compliance Pack，并将所有已 Accept 的客户文件整理成 zip 附件发送至 {COMPLIANCE_TEAM_EMAIL}。
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="actions">
        <button className="button" type="button" disabled={Boolean(loading)} onClick={prepareDraft}>
          {loading === 'draft' ? '生成中…' : '生成合规包'}
        </button>
        <button className="button primary" type="button" disabled={Boolean(loading)} onClick={sendToCompliance}>
          {loading === 'send' ? '发送中…' : '发送给合规'}
        </button>
      </div>
    </div>
  );
}
