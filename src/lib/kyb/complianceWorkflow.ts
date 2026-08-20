import { complianceReplyMessages } from './caseMailThreads.ts';
import { customerEmails } from './mailbox.ts';
import type {
  ComplianceDecisionOutcome,
  ComplianceReviewRound,
  ComplianceSubmitSnapshot,
  KYCCase,
} from './types.ts';

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function currentComplianceRound(caseData: KYCCase): ComplianceReviewRound | undefined {
  if (caseData.complianceReviewRounds?.length) {
    return [...caseData.complianceReviewRounds].sort((a, b) => b.round - a.round)[0];
  }
  if (!caseData.complianceSubmittedAt && !caseData.complianceEmailSentAt) return undefined;
  const feedback = latestComplianceFeedback(caseData);
  const finalStatus = caseData.status === 'approved'
    ? 'approved'
    : caseData.status === 'rejected'
      ? 'rejected'
      : feedback?.outcome === 'request_more_info' || feedback?.outcome === 'edd_required'
        ? 'changes_requested'
        : caseData.complianceEmailSentAt
          ? 'sent'
          : 'draft';
  const submittedAt = caseData.complianceSubmittedAt || caseData.complianceEmailSentAt!;
  return {
    round: caseData.complianceRound || 1,
    status: finalStatus,
    submittedBy: 'legacy',
    submittedAt,
    emailSentAt: caseData.complianceEmailSentAt,
    feedbackAt: feedback?.at,
    feedbackOutcome: feedback?.outcome,
    clientFollowUpSentAt: caseData.clientFollowUpSentAt,
    attachmentNames: caseData.receivedDocuments.filter((doc) => doc.status === 'accepted').map((doc) => doc.name),
    snapshot: caseData.complianceSubmitSnapshot || {
      missing_required: [],
      missing_recommended: [],
      pending_doc_types: [],
      received_doc_types: [],
      submittedBy: 'legacy',
      submittedAt,
    },
  };
}

export function currentComplianceRoundNumber(caseData: KYCCase): number {
  return currentComplianceRound(caseData)?.round || caseData.complianceRound || 0;
}

export function updateCurrentComplianceRound(
  caseData: KYCCase,
  patch: Partial<ComplianceReviewRound>,
): ComplianceReviewRound[] {
  const rounds = [...(caseData.complianceReviewRounds || [])];
  const current = currentComplianceRound(caseData);
  if (!current) return rounds;
  if (!rounds.length) return [{ ...current, ...patch }];
  return rounds.map((round) => round.round === current.round ? { ...round, ...patch } : round);
}

export function prepareComplianceRound(input: {
  caseData: KYCCase;
  snapshot: ComplianceSubmitSnapshot;
  attachmentNames: string[];
  submittedBy: string;
  submittedAt: string;
}): { round: number; rounds: ComplianceReviewRound[] } {
  const { caseData, snapshot, attachmentNames, submittedBy, submittedAt } = input;
  const existing = currentComplianceRound(caseData);
  const priorRounds = caseData.complianceReviewRounds?.length
    ? caseData.complianceReviewRounds
    : existing
      ? [existing]
      : [];
  const reuseDraft = Boolean(existing && existing.status === 'draft' && !existing.emailSentAt);
  const round = reuseDraft ? existing!.round : currentComplianceRoundNumber(caseData) + 1;
  const next: ComplianceReviewRound = {
    round,
    status: 'draft',
    submittedBy,
    submittedAt,
    attachmentNames,
    snapshot,
  };
  const rounds = reuseDraft
    ? priorRounds.map((item) => item.round === round ? next : item)
    : [...priorRounds, next];
  return { round, rounds };
}

export function latestComplianceFeedback(caseData: KYCCase): {
  at: string;
  outcome: ComplianceDecisionOutcome | 'unclear';
  note: string;
  from: string;
  subject: string;
} | undefined {
  const decision = caseData.complianceDecisions?.at(-1);
  const reply = complianceReplyMessages(caseData).at(-1);
  if (!decision && !reply) return undefined;
  if (decision && (!reply || timestamp(decision.decidedAt) >= timestamp(reply.createdAt))) {
    return {
      at: decision.decidedAt,
      outcome: decision.outcome,
      note: decision.note,
      from: decision.reviewerEmail,
      subject: `Compliance feedback – ${caseData.companyName}`,
    };
  }
  return {
    at: reply!.createdAt,
    outcome: caseData.complianceReplyAnalysis?.outcome || 'unclear',
    note: reply!.body,
    from: reply!.from,
    subject: reply!.subject,
  };
}

export function feedbackAfterCurrentSubmission(caseData: KYCCase): ReturnType<typeof latestComplianceFeedback> {
  const round = currentComplianceRound(caseData);
  const feedback = latestComplianceFeedback(caseData);
  if (!round?.emailSentAt || !feedback) return undefined;
  return timestamp(feedback.at) >= timestamp(round.emailSentAt) ? feedback : undefined;
}

export function complianceNeedsClientAction(caseData: KYCCase): boolean {
  const feedback = feedbackAfterCurrentSubmission(caseData);
  return feedback?.outcome === 'request_more_info' || feedback?.outcome === 'edd_required'
    || currentComplianceRound(caseData)?.status === 'changes_requested';
}

export function hasClientMaterialAfterFollowUp(caseData: KYCCase): boolean {
  const sentAt = timestamp(caseData.clientFollowUpSentAt);
  if (!sentAt) return false;
  if (caseData.receivedDocuments.some((doc) => timestamp(doc.receivedAt) > sentAt)) return true;
  const contacts = new Set(customerEmails(caseData));
  return (caseData.mailboxMessages || []).some((message) => {
    if (message.direction !== 'inbound' || timestamp(message.createdAt) <= sentAt) return false;
    const match = message.from.match(/<([^>]+)>/);
    const from = (match ? match[1] : message.from).trim().toLowerCase();
    return contacts.has(from);
  });
}

export function resubmissionBlockers(caseData: KYCCase, snapshot: ComplianceSubmitSnapshot): string[] {
  const checklistBlockers: string[] = [];
  if (snapshot.missing_required.length) {
    checklistBlockers.push(`仍缺少必需材料：${snapshot.missing_required.join('、')}`);
  }
  if (snapshot.pending_doc_types.length) {
    checklistBlockers.push(`以下材料尚未由 KYC Accept：${snapshot.pending_doc_types.join('、')}`);
  }

  const current = currentComplianceRound(caseData);
  if (!current?.emailSentAt) return checklistBlockers;
  const feedback = feedbackAfterCurrentSubmission(caseData);
  if (!feedback) return ['当前一轮仍在等待合规回复，不能重复送审。'];
  if (feedback.outcome !== 'request_more_info' && feedback.outcome !== 'edd_required') {
    return ['当前合规反馈没有要求补件或 EDD，不能创建补件复审轮次。'];
  }

  const blockers: string[] = [];
  if (!caseData.clientFollowUpSentAt || timestamp(caseData.clientFollowUpSentAt) < timestamp(feedback.at)) {
    blockers.push('请先由 KYC 根据本轮合规反馈向客户发送补件邮件。');
  } else if (!hasClientMaterialAfterFollowUp(caseData)) {
    blockers.push('尚未记录客户在补件邮件之后提交的新材料或回复。');
  }
  blockers.push(...checklistBlockers);
  return blockers;
}

export function canFinalizeCurrentRound(caseData: KYCCase): boolean {
  const current = currentComplianceRound(caseData);
  return Boolean(current?.emailSentAt && current.status === 'sent' && caseData.status === 'compliance_review');
}
