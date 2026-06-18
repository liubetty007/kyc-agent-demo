import Link from 'next/link';
import { CaseSearchBox } from '@/components/CaseSearchBox';
import { filterCases, isCaseCompleted } from '@/lib/kyb/caseViews';
import { caseStatusBadgeClass } from '@/lib/kyb/complianceReview';
import { businessTypeLabel } from '@/lib/kyb/types';
import type { KYCCase } from '@/lib/kyb/types';

type HomeDashboardProps = {
  cases: KYCCase[];
  canCreate: boolean;
};

function statusBadgeClass(caseData: KYCCase): string {
  return caseStatusBadgeClass(caseData);
}

function statusBadgeLabel(caseData: KYCCase): string {
  if (isCaseCompleted(caseData)) return caseData.status === 'approved' ? '通过' : '不通过';
  if (caseStatusBadgeClass(caseData) === 'compliance-feedback-pending') return '合规已回复';
  return '流程中';
}

export function HomeDashboard({ cases, canCreate }: HomeDashboardProps) {
  const inProgress = filterCases(cases, 'in_progress');
  const completed = filterCases(cases, 'completed');
  const complianceQueue = filterCases(cases, 'compliance_submitted');
  const recent = [...cases]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 12);

  const searchOptions = cases.map((caseData) => ({
    id: caseData.id,
    companyName: caseData.companyName,
    contactEmail: caseData.contactEmail,
  }));

  return (
    <div className="home-dashboard">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">KYC Agent</p>
          <h1>机构开户工作台</h1>
          <p className="home-lead">搜索客户快速进入案件，或从下方开始新的 KYC 流程。</p>
        </div>
        <div className="home-hero-search">
          <CaseSearchBox cases={searchOptions} variant="hero" />
        </div>
      </section>

      <div className="home-middle">
        <section className="home-stats">
          <Link href="/cases" className="stat-card stat-all">
            <span className="stat-value">{cases.length}</span>
            <span className="stat-label">所有案件</span>
            <span className="stat-hint">查看完整列表</span>
          </Link>
          <Link href="/cases/in-progress" className="stat-card stat-progress">
            <span className="stat-value">{inProgress.length}</span>
            <span className="stat-label">流程中</span>
            <span className="stat-hint">开户 · 收件 · 审阅</span>
          </Link>
          <Link href="/cases/compliance-submitted" className="stat-card stat-compliance">
            <span className="stat-value">{complianceQueue.length}</span>
            <span className="stat-label">已送合规</span>
            <span className="stat-hint">抓取合规回复</span>
          </Link>
          <Link href="/cases/completed" className="stat-card stat-done">
            <span className="stat-value">{completed.length}</span>
            <span className="stat-label">已完成</span>
            <span className="stat-hint">已结案</span>
          </Link>
        </section>

        <section className="home-actions">
          {canCreate && (
            <Link href="/cases/new" className="action-card action-create">
              <div className="action-icon" aria-hidden>+</div>
              <div>
                <h2>新建 Case</h2>
                <p>创建机构客户，自动生成 checklist 与开户邮件草稿。</p>
              </div>
              <span className="action-arrow">→</span>
            </Link>
          )}
          <Link href="/policy" className="action-card action-policy">
            <div className="action-icon" aria-hidden>§</div>
            <div>
              <h2>Policy Review</h2>
              <p>查看 KYC 文件矩阵与合规政策要求。</p>
            </div>
            <span className="action-arrow">→</span>
          </Link>
        </section>
      </div>

      <section className="card home-recent">
        <div className="card-heading">
          <h2>最近案件</h2>
          <Link href="/cases" className="small home-recent-link">
            查看全部 →
          </Link>
        </div>
        {recent.length ? (
          <div className="recent-grid">
            {recent.map((caseData) => (
              <Link
                key={caseData.id}
                href={`/cases/${caseData.id}`}
                className={`recent-card${caseStatusBadgeClass(caseData) === 'compliance-feedback-pending' ? ' recent-card-compliance-feedback' : ''}`}
              >
                <div className="recent-card-top">
                  <strong>{caseData.companyName}</strong>
                  <span className={`badge ${statusBadgeClass(caseData)}`}>
                    {statusBadgeLabel(caseData)}
                  </span>
                </div>
                <p className="small">{caseData.contactEmail || '—'}</p>
                <p className="recent-meta">
                  {caseData.jurisdiction} · {businessTypeLabel(caseData.businessType)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="small">还没有案件。{canCreate ? '点击上方「新建 Case」开始。' : ''}</p>
        )}
      </section>
    </div>
  );
}
