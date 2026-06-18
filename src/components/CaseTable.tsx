import Link from 'next/link';
import { caseStatusBadgeClass, caseStatusLabel } from '@/lib/kyb/complianceReview';
import { businessTypeLabel } from '@/lib/kyb/types';
import type { KYCCase } from '@/lib/kyb/types';

export function CaseTable({ cases }: { cases: KYCCase[] }) {
  if (!cases.length) {
    return <p className="small">暂无案件。</p>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Case ID</th>
          <th>客户</th>
          <th>注册地</th>
          <th>业务类型</th>
          <th>状态</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {cases.map((caseData) => (
          <tr
            key={caseData.id}
            className={caseStatusBadgeClass(caseData) === 'compliance-feedback-pending' ? 'case-row-compliance-feedback' : undefined}
          >
            <td className="small">{caseData.id}</td>
            <td>
              <strong>{caseData.companyName}</strong>
              {caseData.contactEmail ? <div className="small">{caseData.contactEmail}</div> : null}
            </td>
            <td>{caseData.jurisdiction}</td>
            <td>{businessTypeLabel(caseData.businessType)}</td>
            <td>
              <span className={`badge ${caseStatusBadgeClass(caseData)}`}>
                {caseStatusLabel(caseData)}
              </span>
            </td>
            <td>
              <Link className="button" href={`/cases/${caseData.id}`}>
                打开
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
