import { requireApiUser } from '@/lib/auth/admin';
import {
  buildClientFollowUpEmailDraft,
  buildClientFollowUpSummaryFromBackend,
  buildClientFollowUpSummaryFromLocal,
} from '@/lib/kyb/clientEmailDraft';
import { checklistSnapshotFromStatuses } from '@/lib/kyb/complianceSubmit';
import { generateChecklist } from '@/lib/kyb/checklist';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { getBackendChecklist, isBackendEnabled, listBackendDocuments } from '@/lib/kyc-backend/client';
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

  let summary;

  if (isBackendEnabled() && isBackendCaseId(caseId)) {
    try {
      const [checklist, documents] = await Promise.all([
        getBackendChecklist(caseId),
        listBackendDocuments(caseId),
      ]);
      const snapshot = checklistSnapshotFromStatuses(
        caseData,
        checklist.received_doc_types,
        checklist.pending_doc_types,
      );
      summary = buildClientFollowUpSummaryFromBackend({
        ...checklist,
        ...snapshot,
        required_doc_types: generateChecklist(caseData).filter((item) => item.required).map((item) => item.id),
      }, documents);
    } catch (error) {
      console.warn('Backend follow-up summary unavailable; falling back to local case data.', error);
      summary = buildClientFollowUpSummaryFromLocal(caseData);
    }
  } else {
    summary = buildClientFollowUpSummaryFromLocal(caseData);
  }

  const emailDraft = buildClientFollowUpEmailDraft(caseData, summary);
  const updated = await updateCase(caseId, { emailDraft, status: 'awaiting_client_information' });
  return NextResponse.json({ case: updated, emailDraft, summary });
}
