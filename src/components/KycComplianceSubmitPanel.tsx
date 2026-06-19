'use client';

import Link from 'next/link';
import { useState } from 'react';
import { hasComplianceReply, wasSubmittedToCompliance } from '@/lib/kyb/caseViews';
import { canSubmitCaseToCompliance } from '@/lib/kyb/complianceSubmit';
import type { KYCCase } from '@/lib/kyb/types';

export function KycComplianceSubmitPanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasReply = hasComplianceReply(caseData);
  const submitted = wasSubmittedToCompliance(caseData);
  const canSubmit = canSubmitCaseToCompliance(caseData.status);
  const draftReady = Boolean(caseData.complianceEmailDraft);

  if (hasReply) return null;

  async function submit() {
    setLoading(true);
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/submit-compliance`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || '提交失败');
      setLoading(false);
      return;
    }
    window.location.reload();
  }

  if (submitted) {
    return (
      <div className="card submit-compliance-card">
        <div className="card-heading">
          <h2>合规</h2>
          <Link className="small" href={`/cases/${caseData.id}/compliance`}>打开合规页面 →</Link>
        </div>
        <p className="small">
          {caseData.complianceEmailSentAt
            ? `已发送合规邮件 · ${new Date(caseData.complianceEmailSentAt).toLocaleString()}`
            : draftReady
              ? '合规邮件草稿已生成，请在合规页面发送。'
              : '已提交合规，等待处理。'}
        </p>
      </div>
    );
  }

  if (readOnly || !canSubmit) return null;

  return (
    <div className="card submit-compliance-card">
      <h2>提交合规</h2>
      <p className="small">完成 KYC 初审后，生成合规邮件草稿并提交给合规团队审阅。</p>
      {error && <p className="form-error">{error}</p>}
      <div className="actions">
        <button className="button primary" type="button" disabled={loading} onClick={submit}>
          {loading ? '提交中…' : '提交合规'}
        </button>
      </div>
    </div>
  );
}
