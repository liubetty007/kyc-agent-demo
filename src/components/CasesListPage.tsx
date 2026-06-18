import Link from 'next/link';
import { CaseSearchBox } from '@/components/CaseSearchBox';
import { CaseTable } from '@/components/CaseTable';
import { CASE_LIST_TITLES, filterCases, type CaseListFilter } from '@/lib/kyb/caseViews';
import type { KYCCase } from '@/lib/kyb/types';

type CasesListPageProps = {
  cases: KYCCase[];
  filter: CaseListFilter;
  showSearch?: boolean;
};

export function CasesListPage({ cases, filter, showSearch = false }: CasesListPageProps) {
  const filtered = filterCases(cases, filter);
  const copy = CASE_LIST_TITLES[filter];

  return (
    <div className="grid page-stack">
      <section className="page-header">
        <div>
          <Link href="/" className="page-back">
            ← 返回首页
          </Link>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </section>

      {showSearch && (
        <section className="card card-compact">
          <CaseSearchBox
            cases={cases.map((caseData) => ({
              id: caseData.id,
              companyName: caseData.companyName,
              contactEmail: caseData.contactEmail,
            }))}
          />
        </section>
      )}

      <section className="card">
        <div className="card-heading">
          <h2>案件列表</h2>
          <span className="small">{filtered.length} 个案件</span>
        </div>
        <CaseTable cases={filtered} />
      </section>
    </div>
  );
}
