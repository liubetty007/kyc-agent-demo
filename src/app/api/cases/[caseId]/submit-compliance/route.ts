import { requireApiUser } from '@/lib/auth/admin';
import { generateComplianceEmail } from '@/lib/kyb/complianceEmail';
import { acceptedDocumentNames, backendAcceptedDocumentNames } from '@/lib/kyb/complianceAttachments';
import { defaultComplianceEmail } from '@/lib/kyb/mailbox';
import { checklistSnapshotFromStatuses, localChecklistSnapshot } from '@/lib/kyb/complianceSubmit';
import { generateCompliancePack } from '@/lib/kyb/compliancePack';
import { runReview } from '@/lib/kyb/review';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { getBackendChecklist, isBackendEnabled } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';
import { prepareComplianceRound, resubmissionBlockers } from '@/lib/kyb/complianceWorkflow';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  if (caseData.status === 'approved') {
    return NextResponse.json({ error: '该案件已通过合规审批。' }, { status: 400 });
  }

  let checklistSnapshot;
  if (isBackendEnabled() && isBackendCaseId(caseId)) {
    try {
      const checklist = await getBackendChecklist(caseId);
      checklistSnapshot = checklistSnapshotFromStatuses(
        caseData,
        checklist.received_doc_types,
        checklist.pending_doc_types,
      );
    } catch {
      console.warn('Backend compliance checklist unavailable; falling back to local case data.');
      checklistSnapshot = localChecklistSnapshot(caseData);
    }
  } else {
    checklistSnapshot = localChecklistSnapshot(caseData);
  }

  const review = runReview(caseData);
  let attachmentNames = acceptedDocumentNames(caseData);
  if (isBackendEnabled() && isBackendCaseId(caseId)) {
    try {
      attachmentNames = await backendAcceptedDocumentNames(caseId);
    } catch {
      console.warn('Backend accepted document list unavailable; falling back to local case data.');
    }
  }
  const submittedAt = new Date().toISOString();
  const complianceSubmitSnapshot = {
    ...checklistSnapshot,
    submittedBy: user.email,
    submittedAt,
  };
  const blockers = resubmissionBlockers(caseData, complianceSubmitSnapshot);
  if (blockers.length) {
    return NextResponse.json({ error: blockers.join('\n'), blockers }, { status: 409 });
  }

  const prepared = prepareComplianceRound({
    caseData,
    snapshot: complianceSubmitSnapshot,
    attachmentNames,
    submittedBy: user.email,
    submittedAt,
  });
  const complianceEmailTo = caseData.complianceEmailTo || defaultComplianceEmail(caseData);
  const compliancePack = generateCompliancePack(caseData, review);
  const complianceEmailDraft = generateComplianceEmail(caseData, review, attachmentNames, complianceEmailTo, prepared.round);

  const updated = await updateCase(caseId, {
    review,
    compliancePack,
    complianceEmailDraft,
    complianceEmailTo,
    complianceEmailSentAt: undefined,
    status: 'compliance_review',
    complianceSubmittedAt: submittedAt,
    complianceSubmitSnapshot,
    complianceRound: prepared.round,
    complianceReviewRounds: prepared.rounds,
    complianceReplyAnalysis: undefined,
  });

  return NextResponse.json({
    case: updated,
    checklist: checklistSnapshot,
  });
}
