import { complianceOutcomeLabel } from '@/lib/kyb/complianceReview';
import type { ComplianceDecision } from '@/lib/kyb/types';

export function ComplianceDecisionPanel({ decisions }: { decisions: ComplianceDecision[] }) {
  if (!decisions.length) return null;

  return (
    <div className="card compliance-history-card">
      <h2>合规审批记录</h2>
      <div className="compliance-history-list">
        {[...decisions].reverse().map((decision, index) => (
          <article key={`${decision.decidedAt}-${index}`} className="compliance-history-item">
            <div className="compliance-history-head">
              <span className={`badge ${decision.outcome === 'approved' ? 'ready' : decision.outcome === 'rejected' ? 'prohibited' : 'needs-review'}`}>
                {complianceOutcomeLabel(decision.outcome)}
              </span>
              <span className="small">
                {new Date(decision.decidedAt).toLocaleString()} · {decision.reviewerEmail}
              </span>
            </div>
            <pre className="compliance-history-note">{decision.note}</pre>
          </article>
        ))}
      </div>
    </div>
  );
}
