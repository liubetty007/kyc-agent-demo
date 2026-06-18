'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { complianceReplyMessages } from '@/lib/kyb/caseMailThreads';
import { complianceReplyExcerpt } from '@/lib/kyb/complianceReplyText';
import { readResponseError } from '@/lib/http';
import type { KYCCase } from '@/lib/kyb/types';

export function ComplianceSubmittedTable({ cases }: { cases: KYCCase[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function fetchReply(caseId: string) {
    setLoadingId(caseId);
    setError('');
    const response = await fetch(`/api/cases/${caseId}/compliance-ingest`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || await readResponseError(response, '抓取失败'));
      setLoadingId(null);
      return;
    }
    if (!data.imported) {
      alert('暂无新回复');
      setLoadingId(null);
      return;
    }
    router.refresh();
    setLoadingId(null);
  }

  if (!cases.length) {
    return <p className="small">暂无已送合规的案件。</p>;
  }

  return (
    <div className="compliance-queue-list">
      {error && <p className="form-error">{error}</p>}
      {cases.map((caseData) => {
        const latestReply = complianceReplyMessages(caseData).at(-1);
        return (
          <article key={caseData.id} className="compliance-queue-item">
            <div className="compliance-queue-head">
              <div>
                <strong>{caseData.companyName}</strong>
                <p className="small">{caseData.contactEmail || '—'}</p>
              </div>
              <div className="actions">
                {caseData.complianceEmailSentAt && (
                  <button
                    className="button"
                    type="button"
                    disabled={loadingId === caseData.id}
                    onClick={() => fetchReply(caseData.id)}
                  >
                    {loadingId === caseData.id ? '抓取中…' : '抓取回复'}
                  </button>
                )}
                <Link className="button primary" href={`/cases/${caseData.id}/compliance`}>
                  打开
                </Link>
              </div>
            </div>
            {latestReply ? (
              <div className="compliance-reply-block">
                <p className="small">
                  {latestReply.from} · {new Date(latestReply.createdAt).toLocaleString()}
                </p>
                <p className="compliance-history-note">{complianceReplyExcerpt(latestReply.body)}</p>
              </div>
            ) : (
              <p className="small">等待合规回复</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
