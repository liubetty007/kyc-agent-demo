import { complianceOutcomeLabel, isCaseAwaitingKycComplianceFeedback, latestComplianceDecision } from '@/lib/kyb/complianceReview';
import type { KYCCase } from '@/lib/kyb/types';

export function ComplianceFeedbackBanner({ caseData }: { caseData: KYCCase }) {
  if (!isCaseAwaitingKycComplianceFeedback(caseData)) return null;

  const latest = latestComplianceDecision(caseData.complianceDecisions);
  if (!latest) return null;

  return (
    <div className="card compliance-feedback-banner">
      <h2>合规反馈待处理</h2>
      <p>
        <span className={`badge compliance-feedback-pending`}>{complianceOutcomeLabel(latest.outcome)}</span>
        {' '}
        <span className="small">
          {new Date(latest.decidedAt).toLocaleString()} · 审批人 {latest.reviewerEmail}
        </span>
      </p>
      <pre className="compliance-history-note">{latest.note}</pre>
    </div>
  );
}
