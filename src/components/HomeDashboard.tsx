import Link from 'next/link';
import { CaseSearchBox } from '@/components/CaseSearchBox';
import { HomeAssistantPanel } from '@/components/HomeAssistantPanel';
import type { KYCCase } from '@/lib/kyb/types';

type HomeDashboardProps = {
  cases: KYCCase[];
  canCreate: boolean;
};

export function HomeDashboard({ cases, canCreate }: HomeDashboardProps) {
  const searchOptions = cases.map((caseData) => ({
    id: caseData.id,
    companyName: caseData.companyName,
    contactEmail: caseData.contactEmail,
  }));

  return (
    <div className="home-dashboard home-dashboard-simple">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">KYC Agent</p>
          <h1>机构开户工作台</h1>
          <p className="home-lead">用对话助手创建 Case、查进度、上传资料；需要时也可搜索客户快速进入案件。</p>
        </div>
        <div className="home-hero-search">
          <CaseSearchBox cases={searchOptions} variant="hero" />
        </div>
      </section>

      <HomeAssistantPanel canCreate={canCreate} />

      <div className="home-quick-links">
        <Link href="/cases" className="home-quick-link">所有案件 →</Link>
        <Link href="/cases/in-progress" className="home-quick-link">流程中 →</Link>
        <Link href="/policy" className="home-quick-link">Policy Review →</Link>
        {canCreate ? <Link href="/cases/new" className="home-quick-link">表单新建 Case →</Link> : null}
      </div>
    </div>
  );
}
