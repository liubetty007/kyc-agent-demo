import { requireApiUser } from '@/lib/auth/admin';
import { getBackendChecklist, isBackendEnabled, listBackendDocuments, reviewBackendDocument } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(_request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;
  if (!isBackendEnabled()) return NextResponse.json([]);
  const { caseId } = await params;
  try {
    return NextResponse.json(await listBackendDocuments(caseId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load documents.' }, { status: 502 });
  }
}
