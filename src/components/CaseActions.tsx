'use client';

import { useState } from 'react';
import type { KYCCase } from '@/lib/kyb/types';

export function CaseActions({ caseData }: { caseData: KYCCase }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function post(action: string) {
    if (loading) return;
    setLoading(action);
    const response = await fetch(`/api/cases/${caseData.id}/${action}`, { method: 'POST' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert([data.error, data.hint].filter(Boolean).join('\n\n') || `${action} failed (${response.status})`);
      setLoading(null);
      return;
    }
    if (action === 'email-ingest') {
      const data = await response.json().catch(() => ({}));
      const summary = data.summary ?? data;
      const importedMessages = summary.imported_messages ?? summary.importedMessages ?? 0;
      const createdDocuments = summary.created_documents ?? summary.createdDocuments ?? 0;
      if (createdDocuments > 0) {
        alert(`已导入 ${createdDocuments} 个附件（${importedMessages} 封客户邮件）。页面将刷新。`);
      } else {
        alert(
          '未找到可导入的客户回信。\n\n请确认：\n1. 已用 Gmail 发送开户邮件\n2. 客户用「回复」回信（不要新开邮件）\n3. 回信带有附件\n4. 发件邮箱与案件 contact email 一致',
        );
        setLoading(null);
        return;
      }
    }
    window.location.reload();
  }

  return (
    <div className="actions">
      <button className="button" disabled={Boolean(loading)} onClick={() => post('checklist')}>Regenerate Checklist</button>
      <button className="button" disabled={Boolean(loading)} onClick={() => post('email-ingest')}>Fetch Client Reply</button>
      <button className="button primary" disabled={Boolean(loading)} onClick={() => post('review')}>Run Agent Review</button>
      <button className="button" disabled={Boolean(loading)} onClick={() => post('email')}>Generate Email Draft</button>
      <button className="button" disabled={Boolean(loading)} onClick={() => post('compliance-pack')}>Generate Compliance Pack</button>
      {loading && <span className="small">Running {loading}…</span>}
    </div>
  );
}
