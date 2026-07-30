import { requireApiUser } from '@/lib/auth/admin';
import { checklistSnapshotFromStatuses } from '@/lib/kyb/complianceSubmit';
import { generateChecklist } from '@/lib/kyb/checklist';
import { getCase } from '@/lib/kyb/storage';
import { getBackendChecklist, isBackendEnabled } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(_request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;
  if (!isBackendEnabled()) {
    return NextResponse.json({
      missing_required: [],
      missing_recommended: [],
      received_doc_types: [],
      pending_doc_types: [],
      required_doc_types: [],
    });
  }
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  try {
    const checklist = await getBackendChecklist(caseId);
    const snapshot = checklistSnapshotFromStatuses(
      caseData,
      checklist.received_doc_types,
      checklist.pending_doc_types,
    );
    return NextResponse.json({
      ...snapshot,
      required_doc_types: generateChecklist(caseData).filter((item) => item.required).map((item) => item.id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load checklist.' }, { status: 502 });
  }
}
