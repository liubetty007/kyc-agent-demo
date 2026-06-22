import { requireApiUser } from '@/lib/auth/admin';
import {
  buildClientFollowUpEmailDraft,
  buildClientFollowUpSummaryFromBackend,
  buildClientFollowUpSummaryFromLocal,
} from '@/lib/kyb/clientEmailDraft';
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
      summary = buildClientFollowUpSummaryFromBackend(checklist, documents);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to load checklist.' },
        { status: 502 },
      );
    }
  } else {
    summary = buildClientFollowUpSummaryFromLocal(caseData);
  }

  const emailDraft = buildClientFollowUpEmailDraft(caseData, summary);
  const updated = await updateCase(caseId, { emailDraft, status: 'awaiting_client_information' });
  return NextResponse.json({ case: updated, emailDraft, summary });
}
