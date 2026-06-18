import { requireApiUser } from '@/lib/auth/admin';
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
  try {
    const checklist = await getBackendChecklist(caseId);
    return NextResponse.json({
      missing_required: checklist.missing_required,
      missing_recommended: checklist.missing_recommended,
      received_doc_types: checklist.received_doc_types,
      pending_doc_types: checklist.pending_doc_types,
      required_doc_types: checklist.required_doc_types,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load checklist.' }, { status: 502 });
  }
}
