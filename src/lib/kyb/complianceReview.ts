import type { CaseStatus, ComplianceDecision, ComplianceDecisionOutcome, KYCCase } from './types';
import { hasComplianceReply, isCaseCompleted } from './caseViews';

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
  if (hasComplianceReply(caseData) && !isCaseCompleted(caseData)) return 'compliance-feedback-pending';
  if (isCaseAwaitingKycComplianceFeedback(caseData)) return 'compliance-feedback-pending';
  const { status } = caseData;
  if (status === 'ready_for_compliance' || status === 'approved') return 'ready';
  if (status === 'prohibited' || status === 'rejected') return 'prohibited';
  if (status === 'compliance_review') return 'needs-review';
  if (status === 'awaiting_client_information' || status === 'edd_required') return 'medium';
  return '';
}

export function caseStatusLabel(caseData: KYCCase): string {
  if (isCaseCompleted(caseData)) {
    return caseData.status === 'approved' ? '通过' : '不通过';
  }
  if (hasComplianceReply(caseData) || isCaseAwaitingKycComplianceFeedback(caseData)) {
    return '合规已回复，等待补齐资料';
  }
  if (caseData.status === 'compliance_review') return '合规审核中';
  if (caseData.status === 'awaiting_client_information') return '等待客户补充资料';
  if (caseData.status === 'edd_required') return '需 EDD';
  if (caseData.status === 'ready_for_compliance') return '待送合规';
  return caseData.status;
}
