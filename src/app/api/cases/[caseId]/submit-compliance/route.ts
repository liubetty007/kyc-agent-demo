import { requireApiUser } from '@/lib/auth/admin';
import { generateComplianceEmail } from '@/lib/kyb/complianceEmail';
import { acceptedDocumentNames, backendAcceptedDocumentNames } from '@/lib/kyb/complianceAttachments';
import { defaultComplianceEmail } from '@/lib/kyb/mailbox';
import { localChecklistSnapshot } from '@/lib/kyb/complianceSubmit';
import { generateCompliancePack } from '@/lib/kyb/compliancePack';
import { runReview } from '@/lib/kyb/review';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { getBackendChecklist, isBackendEnabled } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

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
      checklistSnapshot = {
        missing_required: checklist.missing_required,
        missing_recommended: checklist.missing_recommended,
        pending_doc_types: checklist.pending_doc_types,
        received_doc_types: checklist.received_doc_types,
      };
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to load checklist.' },
        { status: 502 },
      );
    }
  } else {
    checklistSnapshot = localChecklistSnapshot(caseData);
  }

  const review = caseData.review || runReview(caseData);
  const compliancePack = caseData.compliancePack || generateCompliancePack(caseData, review);
  const attachmentNames =
    isBackendEnabled() && isBackendCaseId(caseId)
      ? await backendAcceptedDocumentNames(caseId)
      : acceptedDocumentNames(caseData);
  const complianceEmailTo = caseData.complianceEmailTo || defaultComplianceEmail(caseData);
  const complianceEmailDraft = caseData.complianceEmailDraft || generateComplianceEmail(caseData, review, attachmentNames, complianceEmailTo);
  const submittedAt = new Date().toISOString();

  const updated = await updateCase(caseId, {
    review,
    compliancePack,
    complianceEmailDraft,
    complianceEmailTo,
    status: 'compliance_review',
    complianceSubmittedAt: submittedAt,
    complianceSubmitSnapshot: {
      ...checklistSnapshot,
      submittedBy: user.email,
      submittedAt,
    },
  });

  return NextResponse.json({
    case: updated,
    checklist: checklistSnapshot,
  });
}
