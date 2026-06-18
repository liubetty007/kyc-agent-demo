'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMPLIANCE_OUTCOME_LABELS } from '@/lib/kyb/complianceReview';
import type { ComplianceDecisionOutcome, KYCCase } from '@/lib/kyb/types';

type ComplianceReviewPanelProps = {
  caseData: KYCCase;
  reviewerEmail: string;
};

const OUTCOMES: ComplianceDecisionOutcome[] = ['approved', 'rejected', 'request_more_info', 'edd_required'];

export function ComplianceReviewPanel({ caseData, reviewerEmail }: ComplianceReviewPanelProps) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<ComplianceDecisionOutcome>('approved');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!note.trim()) {
      setError('请填写审批备注。');
      return;
    }
    setLoading(true);
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/compliance-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, note }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || '提交失败');
      setLoading(false);
      return;
    }
    router.refresh();
    router.push('/compliance');
  }

  return (
    <div className="card compliance-review-card">
      <h2>合规反馈</h2>
      <p>审阅客户材料与 checklist 后，提交合规结论。备注将自动附上审批人邮箱。</p>

      <div className="compliance-outcome-grid">
        {OUTCOMES.map((value) => (
          <label key={value} className={`compliance-outcome${outcome === value ? ' selected' : ''}`}>
            <input
              type="radio"
              name="compliance-outcome"
              value={value}
              checked={outcome === value}
              onChange={() => setOutcome(value)}
            />
            <span>{COMPLIANCE_OUTCOME_LABELS[value]}</span>
          </label>
        ))}
      </div>

      <label className="compliance-note-label">
        审批备注
        <textarea
          className="compliance-note-input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="请说明通过理由、补充材料要求、EDD 事项或拒绝原因…"
        />
      </label>
      <p className="small">提交后将自动追加：--- from {reviewerEmail}</p>

      {error && <p className="form-error">{error}</p>}

      <div className="actions">
        <button className="button primary" type="button" disabled={loading} onClick={submit}>
          {loading ? '提交中…' : '提交合规反馈'}
        </button>
      </div>
    </div>
  );
}
