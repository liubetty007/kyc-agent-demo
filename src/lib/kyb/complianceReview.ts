import type { CaseStatus, ComplianceDecision, ComplianceDecisionOutcome, KYCCase } from './types';
import { hasComplianceReply, isCaseCompleted, wasSubmittedToCompliance } from './caseViews';

export const COMPLIANCE_OUTCOME_LABELS: Record<ComplianceDecisionOutcome, string> = {
  approved: '通过',
  rejected: '拒绝开户',
  request_more_info: '需补充材料',
  edd_required: '需 EDD',
};

export function statusAfterComplianceDecision(outcome: ComplianceDecisionOutcome): CaseStatus {
  switch (outcome) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'request_more_info':
      return 'awaiting_client_information';
    case 'edd_required':
      return 'edd_required';
  }
}

export function formatComplianceNote(note: string, reviewerEmail: string): string {
  const trimmed = note.trim();
  const suffix = `--- from ${reviewerEmail}`;
  if (!trimmed) return suffix;
  if (trimmed.endsWith(suffix)) return trimmed;
  return `${trimmed}\n\n${suffix}`;
}

export function latestComplianceDecision(decisions?: ComplianceDecision[]): ComplianceDecision | undefined {
  if (!decisions?.length) return undefined;
  return decisions[decisions.length - 1];
}

export function isCaseAwaitingComplianceReview(status: CaseStatus): boolean {
  return status === 'compliance_review';
}

export function complianceOutcomeLabel(outcome: ComplianceDecisionOutcome): string {
  return COMPLIANCE_OUTCOME_LABELS[outcome];
}

/** Compliance returned case to KYC for changes (non-final outcomes). */
export function isCaseAwaitingKycComplianceFeedback(caseData: Pick<KYCCase, 'complianceDecisions'>): boolean {
  const latest = latestComplianceDecision(caseData.complianceDecisions);
  if (!latest) return false;
  return latest.outcome === 'request_more_info' || latest.outcome === 'edd_required';
}

export function caseStatusBadgeClass(caseData: KYCCase): string {
  if (caseData.status === 'approved') return 'accepted';
  if (caseData.status === 'rejected' || caseData.status === 'prohibited') return 'prohibited';
  if (hasComplianceReply(caseData) && !isCaseCompleted(caseData)) return 'compliance-feedback-pending';
  if (isCaseAwaitingKycComplianceFeedback(caseData)) return 'compliance-feedback-pending';
  if (caseData.status === 'compliance_review' || wasSubmittedToCompliance(caseData)) return 'needs-review';
  if (caseData.status === 'awaiting_client_information' || caseData.status === 'edd_required') return 'medium';
  return 'medium';
}

export function caseStatusLabel(caseData: KYCCase): string {
  if (caseData.status === 'approved') return '合规通过';
  if (caseData.status === 'rejected') return '合规拒绝';
  if (caseData.status === 'prohibited') return '禁止开户';

  if (hasComplianceReply(caseData) || isCaseAwaitingKycComplianceFeedback(caseData)) {
    return '合规已回复，等待补齐资料';
  }

  if (caseData.status === 'compliance_review' || wasSubmittedToCompliance(caseData)) {
    if (caseData.complianceEmailSentAt) return '合规审批中';
    return '已提交合规，待发送邮件';
  }

  if (caseData.status === 'awaiting_client_information') return '等待客户补充资料';
  if (caseData.status === 'edd_required') return '需 EDD';

  return '文件上传中';
}
