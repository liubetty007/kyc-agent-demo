'use client';

import { useEffect, useState } from 'react';
import { formatDocTypeLabel, type ComplianceChecklistSnapshot } from '@/lib/kyb/complianceSubmit';
import type { ComplianceSubmitSnapshot, KYCCase } from '@/lib/kyb/types';

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

function snapshotToChecklist(snapshot: ComplianceSubmitSnapshot): ComplianceChecklistSnapshot {
  return {
    missing_required: snapshot.missing_required,
    missing_recommended: snapshot.missing_recommended,
    pending_doc_types: snapshot.pending_doc_types,
    received_doc_types: snapshot.received_doc_types,
  };
}

export function ComplianceChecklistView({ caseData }: { caseData: KYCCase }) {
  const [checklist, setChecklist] = useState<ComplianceChecklistSnapshot | null>(null);
  const [fetching, setFetching] = useState(true);

  const snapshot = caseData.complianceSubmitSnapshot;

  useEffect(() => {
    async function loadChecklist() {
      setFetching(true);
      try {
        if (snapshot) {
          setChecklist(snapshotToChecklist(snapshot));
          return;
        }
        if (isBackendCaseId(caseData.id)) {
          const response = await fetch(`/api/cases/${caseData.id}/backend-checklist`);
          if (response.ok) setChecklist(await response.json());
        } else {
          const { localChecklistSnapshot } = await import('@/lib/kyb/complianceSubmit');
          setChecklist(localChecklistSnapshot(caseData));
        }
      } finally {
        setFetching(false);
      }
    }
    void loadChecklist();
  }, [caseData, snapshot]);

  return (
    <div className="card compliance-checklist-card">
      <h2>Checklist</h2>
      <p className="small">
        {snapshot
          ? `送审快照 · ${new Date(snapshot.submittedAt).toLocaleString()}${snapshot.submittedBy ? ` · ${snapshot.submittedBy}` : ''}`
          : '当前 checklist 状态（送审前快照不可用）'}
      </p>

      {fetching && <p className="small">加载 checklist…</p>}

      {checklist && (
        <div className="compliance-gap-grid">
          <ChecklistGapList
            title="仍缺（必缴）"
            items={checklist.missing_required}
            empty="必缴文件已全部收到（或已 Accept）。"
          />
          <ChecklistGapList
            title="待 KYC 确认"
            items={checklist.pending_doc_types}
            empty="没有待确认的文件。"
          />
          <ChecklistGapList
            title="仍缺（建议）"
            items={checklist.missing_recommended}
            empty="无额外建议项缺失。"
          />
          <ChecklistGapList
            title="已收到（KYC Accepted）"
            items={checklist.received_doc_types}
            empty="尚无已 Accept 的文件。"
          />
        </div>
      )}
    </div>
  );
}
