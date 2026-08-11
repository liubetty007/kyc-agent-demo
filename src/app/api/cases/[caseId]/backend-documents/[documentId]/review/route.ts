import { requireApiUser } from '@/lib/auth/admin';
import { isBackendEnabled, listBackendDocuments, reviewBackendDocument } from '@/lib/kyc-backend/client';
import { getCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';
import { safeErrorResponse } from '@/lib/api/errorResponse';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ caseId: string; documentId: string }> },
) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  if (!isBackendEnabled()) return NextResponse.json({ error: 'Backend is not configured.' }, { status: 503 });
  const { caseId, documentId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  const documents = await listBackendDocuments(caseId);
  if (!documents.some((document) => document.document_id === documentId)) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  const raw = await request.json() as Record<string, unknown>;
  if (!['accept', 'reject', 'reclassify'].includes(String(raw.action || ''))) {
    return NextResponse.json({ error: 'Invalid review action.' }, { status: 400 });
  }
  const body = {
    action: raw.action as 'accept' | 'reject' | 'reclassify',
    ...(typeof raw.doc_type === 'string' ? { doc_type: raw.doc_type.slice(0, 100) } : {}),
    ...(typeof raw.note === 'string' ? { note: raw.note.slice(0, 2000) } : {}),
  };
  try {
    return NextResponse.json(await reviewBackendDocument(caseId, documentId, body));
  } catch (error) {
    return safeErrorResponse('Backend document review failed', error, 'Review failed.', 502);
  }
}
