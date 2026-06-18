import { extractNewReplyText } from './complianceReplyText';
import type { ComplianceDecisionOutcome } from './types';

export type InferredComplianceOutcome = ComplianceDecisionOutcome | 'unclear';

const SUPPLEMENT_PATTERN = /补齐|补充|缺少|缺失|missing|provide|submit|needed|需提供|待补|请提供|please provide|coi|certificate of incorporation|incorporation certificate/i;
const REJECT_PATTERN = /拒绝开户|不予开户|reject(?:ed)?|not approved|cannot (?:proceed|onboard)|不开户|无法开户|不予通过/i;
const APPROVE_PATTERN = /批准开户|可以开户|approve(?:d)?|通过审核|同意开户|可以 proceed/i;
const EDD_PATTERN = /edd|加强尽职/i;

export function inferComplianceOutcomeFromText(text: string): InferredComplianceOutcome {
  const stripped = extractNewReplyText(text);
  const lower = stripped.toLowerCase();
  if (!stripped.trim()) return 'unclear';

  const needsSupplement = SUPPLEMENT_PATTERN.test(stripped) || SUPPLEMENT_PATTERN.test(lower);
  const explicitReject = REJECT_PATTERN.test(stripped) || REJECT_PATTERN.test(lower);
  const explicitApprove = APPROVE_PATTERN.test(stripped) || APPROVE_PATTERN.test(lower);

  if (explicitApprove && !needsSupplement && !explicitReject) return 'approved';
  if (explicitReject && !needsSupplement) return 'rejected';
  if (EDD_PATTERN.test(lower)) return 'edd_required';
  if (needsSupplement) return 'request_more_info';
  return 'request_more_info';
}

export function normalizeAutoComplianceOutcome(
  outcome: InferredComplianceOutcome | 'unclear',
  replyText: string,
): ComplianceDecisionOutcome {
  const inferred = outcome === 'unclear' ? inferComplianceOutcomeFromText(replyText) : outcome;
  if (inferred === 'approved' || inferred === 'rejected') return inferred;
  if (inferred === 'edd_required') return 'edd_required';
  return 'request_more_info';
}

/** Auto flows (ingest / draft) should not close a case as rejected unless compliance was explicit. */
export function outcomeForAutomaticComplianceHandling(
  outcome: InferredComplianceOutcome | 'unclear',
  replyText: string,
): ComplianceDecisionOutcome {
  const normalized = normalizeAutoComplianceOutcome(outcome, replyText);
  if (normalized === 'rejected' && inferComplianceOutcomeFromText(replyText) !== 'rejected') {
    return 'request_more_info';
  }
  return normalized;
}
