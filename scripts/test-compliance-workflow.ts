import assert from 'node:assert/strict';
import {
  canFinalizeCurrentRound,
  currentComplianceRound,
  feedbackAfterCurrentSubmission,
  hasClientMaterialAfterFollowUp,
  prepareComplianceRound,
  resubmissionBlockers,
  updateCurrentComplianceRound,
} from '../src/lib/kyb/complianceWorkflow.ts';
import type { ComplianceSubmitSnapshot, KYCCase } from '../src/lib/kyb/types.ts';

const base = (): KYCCase => ({
  id: 'workflow-test',
  companyName: 'Workflow Test Limited',
  contactEmail: 'client@example.com',
  jurisdiction: 'Hong Kong',
  businessType: 'normal',
  sourceOfFunds: 'Operating income',
  status: 'ready_for_compliance',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  individuals: [],
  receivedDocuments: [{
    id: 'coi-1', requirementId: 'certificate_of_incorporation', name: 'COI.pdf', status: 'accepted',
    receivedAt: '2026-08-13T00:00:00.000Z',
  }],
});

const snapshot = (submittedAt: string): ComplianceSubmitSnapshot => ({
  missing_required: [],
  missing_recommended: [],
  pending_doc_types: [],
  received_doc_types: ['certificate_of_incorporation'],
  submittedBy: 'kyc@example.com',
  submittedAt,
});

let caseData = base();
assert.deepEqual(resubmissionBlockers(caseData, {
  ...snapshot('2026-08-13T00:55:00.000Z'),
  missing_required: ['proof_of_address'],
  pending_doc_types: ['register_of_directors'],
}), [
  '仍缺少必需材料：proof_of_address',
  '以下材料尚未由 KYC Accept：register_of_directors',
]);

const first = prepareComplianceRound({
  caseData,
  snapshot: snapshot('2026-08-13T01:00:00.000Z'),
  attachmentNames: ['COI.pdf'],
  submittedBy: 'kyc@example.com',
  submittedAt: '2026-08-13T01:00:00.000Z',
});
assert.equal(first.round, 1);
assert.equal(first.rounds[0].status, 'draft');

caseData = { ...caseData, status: 'compliance_review', complianceRound: 1, complianceReviewRounds: first.rounds };
caseData = {
  ...caseData,
  complianceEmailSentAt: '2026-08-13T01:05:00.000Z',
  complianceReviewRounds: updateCurrentComplianceRound(caseData, {
    status: 'sent', emailSentAt: '2026-08-13T01:05:00.000Z',
  }),
};
assert.equal(canFinalizeCurrentRound(caseData), true);
assert.deepEqual(resubmissionBlockers(caseData, snapshot('2026-08-13T01:10:00.000Z')), [
  '当前一轮仍在等待合规回复，不能重复送审。',
]);

caseData = {
  ...caseData,
  status: 'awaiting_client_information',
  complianceDecisions: [{
    outcome: 'request_more_info',
    note: 'Please collect updated proof of address.',
    reviewerEmail: 'compliance@example.com',
    decidedAt: '2026-08-13T01:15:00.000Z',
    round: 1,
  }],
  complianceReviewRounds: updateCurrentComplianceRound(caseData, {
    status: 'changes_requested',
    feedbackAt: '2026-08-13T01:15:00.000Z',
    feedbackOutcome: 'request_more_info',
  }),
};
assert.equal(feedbackAfterCurrentSubmission(caseData)?.outcome, 'request_more_info');
assert.match(resubmissionBlockers(caseData, snapshot('2026-08-13T01:20:00.000Z'))[0], /先由 KYC/);

caseData = {
  ...caseData,
  clientFollowUpSentAt: '2026-08-13T01:20:00.000Z',
  complianceReviewRounds: updateCurrentComplianceRound(caseData, {
    clientFollowUpSentAt: '2026-08-13T01:20:00.000Z',
  }),
};
assert.equal(hasClientMaterialAfterFollowUp(caseData), false);
assert.match(resubmissionBlockers(caseData, snapshot('2026-08-13T01:25:00.000Z'))[0], /尚未记录客户/);

caseData = {
  ...caseData,
  receivedDocuments: [...caseData.receivedDocuments, {
    id: 'poa-1', requirementId: 'proof_of_current_residential_address', name: 'POA.pdf', status: 'accepted',
    receivedAt: '2026-08-13T01:30:00.000Z',
  }],
};
assert.equal(hasClientMaterialAfterFollowUp(caseData), true);
assert.deepEqual(resubmissionBlockers(caseData, snapshot('2026-08-13T01:35:00.000Z')), []);

const second = prepareComplianceRound({
  caseData,
  snapshot: snapshot('2026-08-13T01:35:00.000Z'),
  attachmentNames: ['COI.pdf', 'POA.pdf'],
  submittedBy: 'kyc@example.com',
  submittedAt: '2026-08-13T01:35:00.000Z',
});
assert.equal(second.round, 2);
assert.equal(currentComplianceRound({ ...caseData, complianceReviewRounds: second.rounds })?.round, 2);

caseData = {
  ...caseData,
  status: 'compliance_review',
  complianceRound: 2,
  complianceEmailSentAt: undefined,
  complianceReviewRounds: second.rounds,
};
assert.equal(canFinalizeCurrentRound(caseData), false);
caseData = {
  ...caseData,
  complianceEmailSentAt: '2026-08-13T01:40:00.000Z',
  complianceReviewRounds: updateCurrentComplianceRound(caseData, {
    status: 'sent', emailSentAt: '2026-08-13T01:40:00.000Z',
  }),
};
assert.equal(canFinalizeCurrentRound(caseData), true);

console.log('Compliance workflow state-machine tests passed.');
