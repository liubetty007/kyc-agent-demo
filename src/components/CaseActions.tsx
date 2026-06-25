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
    } else if (action === 'review') {
      alert('Agent Review 已完成，页面将刷新。');
    } else if (action === 'compliance-pack') {
      alert('Compliance Pack 已生成，页面将刷新。');
    }
    window.location.reload();
  }

  return (
    <div className="card">
      <div className="card-heading">
        <h2>Workflow Actions</h2>
        <span className="small">内部辅助工具</span>
      </div>
      <p className="small">
        这一步不会发送邮件。`Run Agent Review` 会重新计算缺失文件、风险点和下一步建议；`Generate Compliance Pack` 会生成给合规看的案件摘要。
      </p>
      <div className="actions">
        <button className="button primary" disabled={Boolean(loading)} onClick={() => post('review')}>重新运行 KYC 初审</button>
        <button className="button" disabled={Boolean(loading)} onClick={() => post('compliance-pack')}>生成合规摘要</button>
        {loading && <span className="small">Running {loading}…</span>}
      </div>
    </div>
  );
}
