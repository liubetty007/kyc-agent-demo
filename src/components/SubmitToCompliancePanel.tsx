'use client';

import { useEffect, useState } from 'react';
import { canSubmitCaseToCompliance, formatDocTypeLabel, type ComplianceChecklistSnapshot } from '@/lib/kyb/complianceSubmit';
import type { KYCCase } from '@/lib/kyb/types';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

function ChecklistGapList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="compliance-gap-block">
      <h3>{title}</h3>
      {items.length ? (
        <ul className="list">
          {items.map((item) => (
            <li key={item}>{formatDocTypeLabel(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="small">{empty}</p>
      )}
    </div>
  );
}

export function SubmitToCompliancePanel({ caseData, readOnly = false }: { caseData: KYCCase; readOnly?: boolean }) {
  const [checklist, setChecklist] = useState<ComplianceChecklistSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  const submitted = caseData.status === 'compliance_review' || caseData.status === 'approved';
  const snapshot = caseData.complianceSubmitSnapshot;
  const canSubmit = canSubmitCaseToCompliance(caseData.status);

  useEffect(() => {
    async function loadChecklist() {
      setFetching(true);
      try {
        if (isBackendCaseId(caseData.id)) {
          const response = await fetch(`/api/cases/${caseData.id}/backend-checklist`);
          if (response.ok) {
            setChecklist(await response.json());
          }
        } else {
          const { localChecklistSnapshot } = await import('@/lib/kyb/complianceSubmit');
          setChecklist(localChecklistSnapshot(caseData));
        }
      } finally {
        setFetching(false);
      }
    }
    void loadChecklist();
  }, [caseData]);

  async function submit() {
    setLoading(true);
    setError('');
    const response = await fetch(`/api/cases/${caseData.id}/submit-compliance`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || '提交失败');
      setLoading(false);
      return;
    }
    const missing = data.checklist?.missing_required?.length ?? 0;
    const pending = data.checklist?.pending_doc_types?.length ?? 0;
    alert(
      missing || pending
        ? `已提交合规审批。\n\n仍缺 ${missing} 项必缴文件，${pending} 项待 KYC 确认。合规同事会看到完整 checklist。`
        : '已提交合规审批，checklist 无缺失项。',
    );
    window.location.reload();
  }

  const displayChecklist = submitted && snapshot
    ? {
        missing_required: snapshot.missing_required,
        missing_recommended: snapshot.missing_recommended,
        pending_doc_types: snapshot.pending_doc_types,
        received_doc_types: snapshot.received_doc_types,
      }
    : checklist;

  return (
    <div className="card submit-compliance-card">
      <h2>提交合规审批</h2>
      <p>
        KYC 初审完成后，可直接提交给合规团队审批，<strong>无需发送邮件</strong>。
        文件未齐也可以提交，下方会显示 checklist 缺口。
      </p>

      {submitted && caseData.complianceSubmittedAt && (
        <p className="small">
          <span className="badge accepted">已提交合规</span>
          {' '}
          {new Date(caseData.complianceSubmittedAt).toLocaleString()}
          {snapshot?.submittedBy ? ` · by ${snapshot.submittedBy}` : ''}
        </p>
      )}

      {fetching && <p className="small">加载 checklist…</p>}

      {displayChecklist && (
        <div className="compliance-gap-grid">
          <ChecklistGapList
            title="仍缺（必缴）"
            items={displayChecklist.missing_required}
            empty="必缴文件已全部收到（或已 Accept）。"
          />
          <ChecklistGapList
            title="待 KYC 确认"
            items={displayChecklist.pending_doc_types}
            empty="没有待确认的文件。"
          />
          <ChecklistGapList
            title="仍缺（建议）"
            items={displayChecklist.missing_recommended}
            empty="无额外建议项缺失。"
          />
          <ChecklistGapList
            title="已收到（KYC Accepted）"
            items={displayChecklist.received_doc_types}
            empty="尚无已 Accept 的文件。"
          />
        </div>
      )}

      {error && <p className="form-error">{error}</p>}

      {canSubmit && !readOnly && (
        <div className="actions">
          <button className="button primary" type="button" disabled={loading || fetching} onClick={submit}>
            {loading ? '提交中…' : '提交合规审批'}
          </button>
        </div>
      )}
    </div>
  );
}
