import Link from 'next/link';
import { latestComplianceReply } from '@/lib/kyb/caseMailThreads';
import { complianceReplyExcerpt } from '@/lib/kyb/complianceReplyText';
import { COMPLIANCE_OUTCOME_LABELS } from '@/lib/kyb/complianceReview';
import type { KYCCase } from '@/lib/kyb/types';

const RISK_LABELS = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  unclear: '待人工判断',
} as const;

export function ComplianceReplySummary({ caseData }: { caseData: KYCCase }) {
  const reply = latestComplianceReply(caseData);
  const started = Boolean(caseData.complianceSubmittedAt || caseData.complianceEmailSentAt || reply);
  if (!started) return null;

  const excerpt = reply ? complianceReplyExcerpt(reply.body) : '';
  const analysis = caseData.complianceReplyAnalysis;

  return (
    <div className="card card-compact compliance-reply-summary">
      <div className="card-heading">
        <h2>合规回复</h2>
        <Link className="small" href={`/cases/${caseData.id}/compliance`}>查看详情 →</Link>
      </div>
      {reply && excerpt ? (
        <>
          <p className="small">
            {reply.from} · {new Date(reply.createdAt).toLocaleString()}
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
        <p className="small">等待合规回复</p>
      )}
    </div>
  );
}
