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

function downloadHref(caseId: string, doc: { id: string; backend?: boolean }): string {
  if (doc.backend) {
    return `/api/cases/${caseId}/backend-documents/${doc.id}/download`;
  }
  return `/api/cases/${caseId}/documents/${doc.id}/download`;
}

export function ClientUploadedFilesPanel({ caseData }: { caseData: KYCCase }) {
  const [backendDocs, setBackendDocs] = useState<BackendDocument[]>([]);
  const [fetching, setFetching] = useState(isBackendCaseId(caseData.id));

  const localDocs = caseData.receivedDocuments.filter((doc) => doc.storageObject);
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

  const downloadableBackendDocs = backendDocs.filter((doc) => doc.storage_uri);
  const hasDocs = backendMode ? downloadableBackendDocs.length > 0 : localDocs.length > 0;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2>客户上传文件</h2>
          <p className="small">下载客户通过邮件或上传提交的全部材料。</p>
        </div>
        {caseData.driveFolderId && (
          <a
            className="button"
            href={`https://drive.google.com/drive/folders/${caseData.driveFolderId}`}
            target="_blank"
            rel="noreferrer"
          >
            打开 Drive 文件夹
          </a>
        )}
      </div>

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
              ? downloadableBackendDocs.map((doc) => (
                  <tr key={doc.document_id}>
                    <td><strong>{doc.filename}</strong></td>
                    <td>{formatDocType(doc.doc_type)}</td>
                    <td>
                      <span className={`badge ${doc.review.status === 'accepted' ? 'accepted' : doc.review.status === 'rejected' ? 'prohibited' : 'needs-review'}`}>
                        {doc.review.status}
                      </span>
                    </td>
                    <td>
                      <a
                        className="button"
                        href={downloadHref(caseData.id, { id: doc.document_id, backend: true })}
                        target="_blank"
                        rel="noreferrer"
                      >
                        下载
                      </a>
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
                      <a
                        className="button"
                        href={downloadHref(caseData.id, { id: doc.id })}
                        target="_blank"
                        rel="noreferrer"
                      >
                        下载
                      </a>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
