import Link from 'next/link';
import { complianceReplyExcerpt } from '@/lib/kyb/complianceReplyText';
import { COMPLIANCE_OUTCOME_LABELS } from '@/lib/kyb/complianceReview';
import type { KYCCase } from '@/lib/kyb/types';
import { currentComplianceRound, feedbackAfterCurrentSubmission } from '@/lib/kyb/complianceWorkflow';

const RISK_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  unclear: '待人工判断',
} as const;

export function ComplianceReplySummary({ caseData }: { caseData: KYCCase }) {
  const round = currentComplianceRound(caseData);
  const feedback = feedbackAfterCurrentSubmission(caseData);
  const started = Boolean(round || caseData.complianceSubmittedAt || caseData.complianceEmailSentAt);
  if (!started) return null;

  const excerpt = feedback ? complianceReplyExcerpt(feedback.note) : '';
  const analysis = caseData.complianceReplyAnalysis;

  return (
    <div className="card card-compact compliance-reply-summary">
      <div className="card-heading">
        <h2>合规回复</h2>
        <Link className="small" href={`/cases/${caseData.id}/compliance`}>查看详情 →</Link>
      </div>
      {feedback && excerpt ? (
        <>
          <p className="small">
            第 {round?.round || 1} 轮 · {feedback.from} · {new Date(feedback.at).toLocaleString()}
          </p>
          {analysis && (
            <div className="compliance-reply-result">
              <span className="badge accepted">
                结果：{analysis.outcome === 'unclear' ? '待人工判断' : COMPLIANCE_OUTCOME_LABELS[analysis.outcome]}
              </span>
              <span className={`badge ${analysis.riskLevel === 'high' ? 'prohibited' : analysis.riskLevel === 'low' ? 'accepted' : 'medium'}`}>
                风险：{RISK_LABELS[analysis.riskLevel]}
              </span>
              <p className="small">{analysis.summary}</p>
            </div>
          )}
          <p className="compliance-history-note">{excerpt}</p>
        </>
      ) : (
        <p className="small">等待第 {round?.round || 1} 轮合规回复</p>
      )}
    </div>
  );
}
