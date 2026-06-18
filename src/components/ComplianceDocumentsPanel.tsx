'use client';

import { useEffect, useState } from 'react';
import type { BackendDocument } from '@/lib/kyc-backend/client';
import { formatDocTypeLabel } from '@/lib/kyb/complianceSubmit';
import type { KYCCase } from '@/lib/kyb/types';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

function formatDocType(docType?: string | null): string {
  if (!docType) return '未分类';
  return formatDocTypeLabel(docType);
}

export function ComplianceDocumentsPanel({ caseData }: { caseData: KYCCase }) {
  const [backendDocs, setBackendDocs] = useState<BackendDocument[]>([]);
  const [fetching, setFetching] = useState(isBackendCaseId(caseData.id));

  const localDocs = caseData.receivedDocuments.filter((doc) => doc.status !== 'invalid');
  const backendMode = isBackendCaseId(caseData.id);

  useEffect(() => {
    if (!backendMode) return;
    async function load() {
      setFetching(true);
      try {
        const response = await fetch(`/api/cases/${caseData.id}/backend-documents`);
        if (response.ok) setBackendDocs(await response.json());
      } finally {
        setFetching(false);
      }
    }
    void load();
  }, [caseData.id, backendMode]);

  const hasDocs = backendMode ? backendDocs.length > 0 : localDocs.length > 0;

  return (
    <div className="card compliance-documents-card">
      <h2>客户上传文件</h2>
      <p className="small">合规可下载审阅全部客户材料，无需进入 KYC 工作流页面。</p>

      {fetching && <p className="small">加载文件列表…</p>}

      {!fetching && !hasDocs && <p className="small">暂无客户上传文件。</p>}

      {hasDocs && (
        <table className="table">
          <thead>
            <tr>
              <th>文件名</th>
              <th>类型</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {backendMode
              ? backendDocs.map((doc) => (
                  <tr key={doc.document_id}>
                    <td><strong>{doc.filename}</strong></td>
                    <td>{formatDocType(doc.doc_type)}</td>
                    <td>
                      <span className={`badge ${doc.review.status === 'accepted' ? 'accepted' : doc.review.status === 'rejected' ? 'prohibited' : 'needs-review'}`}>
                        {doc.review.status}
                      </span>
                    </td>
                    <td>
                      {doc.storage_uri ? (
                        <a
                          className="button"
                          href={`/api/cases/${caseData.id}/backend-documents/${doc.document_id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          下载
                        </a>
                      ) : (
                        <span className="small">无存储文件</span>
                      )}
                    </td>
                  </tr>
                ))
              : localDocs.map((doc) => (
                  <tr key={doc.id}>
                    <td><strong>{doc.name}</strong></td>
                    <td>{formatDocType(doc.requirementId)}</td>
                    <td>
                      <span className={`badge ${doc.status === 'accepted' ? 'accepted' : doc.status === 'needs_review' ? 'needs-review' : ''}`}>
                        {doc.status}
                      </span>
                    </td>
                    <td>
                      {doc.storageObject ? (
                        <a
                          className="button"
                          href={`/api/cases/${caseData.id}/documents/${doc.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          下载
                        </a>
                      ) : (
                        <span className="small">无存储文件</span>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
