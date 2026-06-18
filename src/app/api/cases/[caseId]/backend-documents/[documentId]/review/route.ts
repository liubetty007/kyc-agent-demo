import { requireApiUser } from '@/lib/auth/admin';
import { isBackendEnabled, reviewBackendDocument } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string; documentId: string }> },
) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  if (!isBackendEnabled()) return NextResponse.json({ error: 'Backend is not configured.' }, { status: 503 });
  const { caseId, documentId } = await params;
  const body = await request.json();
  try {
    return NextResponse.json(await reviewBackendDocument(caseId, documentId, body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Review failed.' }, { status: 502 });
  }
}
