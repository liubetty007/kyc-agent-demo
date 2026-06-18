import type { KYCCase } from './types';

export type CaseListFilter = 'all' | 'in_progress' | 'completed' | 'compliance_submitted';

export function isCaseSubmittedToCompliance(caseData: KYCCase): boolean {
  return Boolean(caseData.complianceSubmittedAt || caseData.complianceEmailSentAt);
}

export function isCaseCompleted(caseData: KYCCase): boolean {
  return caseData.status === 'approved' || caseData.status === 'rejected';
}

export function isCaseInProgress(caseData: KYCCase): boolean {
  return !isCaseCompleted(caseData) && !isCaseSubmittedToCompliance(caseData);
}

export function filterCases(cases: KYCCase[], filter: CaseListFilter): KYCCase[] {
  if (filter === 'compliance_submitted') {
    return cases
      .filter(isCaseSubmittedToCompliance)
      .sort((a, b) => {
        const aTime = new Date(a.complianceSubmittedAt || a.complianceEmailSentAt || a.updatedAt).getTime();
        const bTime = new Date(b.complianceSubmittedAt || b.complianceEmailSentAt || b.updatedAt).getTime();
        return bTime - aTime;
      });
  }
  if (filter === 'completed') return cases.filter(isCaseCompleted);
  if (filter === 'in_progress') return cases.filter(isCaseInProgress);
  return cases;
}

export const CASE_LIST_TITLES: Record<CaseListFilter, { title: string; description: string }> = {
  all: {
    title: '所有案件',
    description: '查看全部 KYC 案件，可用搜索框按客户名称或邮箱快速进入。',
  },
  in_progress: {
    title: '流程中的案件',
    description: '尚未提交合规审核的案件（开户、收件、Agent 审阅等阶段）。',
  },
  completed: {
    title: '已完成的案件',
    description: '合规已作出最终决定：通过或拒绝开户。',
  },
  compliance_submitted: {
    title: '已送合规',
    description: '合规回复与邮件处理。',
  },
};
