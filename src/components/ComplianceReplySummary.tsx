import Link from 'next/link';
import { latestComplianceReply } from '@/lib/kyb/caseMailThreads';
import { complianceReplyExcerpt } from '@/lib/kyb/complianceReplyText';
import type { KYCCase } from '@/lib/kyb/types';

export function ComplianceReplySummary({ caseData }: { caseData: KYCCase }) {
  const reply = latestComplianceReply(caseData);
  const started = Boolean(caseData.complianceSubmittedAt || caseData.complianceEmailSentAt || reply);
  if (!started) return null;

  const excerpt = reply ? complianceReplyExcerpt(reply.body) : '';

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
          <p className="compliance-history-note">{excerpt}</p>
        </>
      ) : (
        <p className="small">等待合规回复</p>
      )}
    </div>
  );
}
