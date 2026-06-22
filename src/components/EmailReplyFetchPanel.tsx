'use client';

import { useState } from 'react';
import { readResponseError } from '@/lib/http';
import type { KYCCase } from '@/lib/kyb/types';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

export function EmailReplyFetchPanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canFetch = isBackendCaseId(caseData.id) || Boolean(caseData.mailboxMessages?.length);

  async function fetchEmailReply() {
    setLoading(true);
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/email-ingest`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || await readResponseError(response, '抓取失败'));
      setLoading(false);
      return;
    }
    const summary = data.summary ?? data;
    const importedMessages = summary.imported_messages ?? summary.importedMessages ?? 0;
    const importedDocuments = summary.created_documents ?? summary.createdDocuments ?? summary.importedDocuments ?? 0;
    if (!importedMessages && !importedDocuments) {
      setError('暂无新回复');
      setLoading(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="card" id="email-reply-fetch">
      <div className="card-heading">
        <h2>Fetch Email Reply</h2>
        <span className="small">先抓客户回信，再刷新 checklist</span>
      </div>
      <p>
        这一步会调用邮件回复分析，自动抽取新附件并重新整理 Checklist。当前实现会用 LLM 做邮件意图和附件分类。
      </p>
      {error && <p className="form-error">{error}</p>}
      {!readOnly && (
        <div className="actions">
          <button className="button primary" type="button" disabled={loading || !canFetch} onClick={fetchEmailReply}>
            {loading ? 'Fetching…' : 'Fetch Email Reply'}
          </button>
        </div>
      )}
    </div>
  );
}
