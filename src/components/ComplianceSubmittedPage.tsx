import Link from 'next/link';
import { ComplianceSubmittedTable } from '@/components/ComplianceSubmittedTable';
import { CASE_LIST_TITLES, filterCases } from '@/lib/kyb/caseViews';
import type { KYCCase } from '@/lib/kyb/types';

export function ComplianceSubmittedPage({ cases }: { cases: KYCCase[] }) {
  const filtered = filterCases(cases, 'compliance_submitted');
  const copy = CASE_LIST_TITLES.compliance_submitted;

  return (
    <div className="grid page-stack">
      <section className="page-header">
        <Link href="/" className="page-back">← 返回首页</Link>
        <h1>{copy.title}</h1>
        <p>查看合规回复，或在案件页处理邮件草稿。</p>
      </section>

      <section className="card compliance-submitted-card">
        <ComplianceSubmittedTable cases={filtered} />
      </section>
    </div>
  );
}
