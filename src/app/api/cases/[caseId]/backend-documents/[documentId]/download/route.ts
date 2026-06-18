import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { isBackendEnabled, listBackendDocuments } from '@/lib/kyc-backend/client';
import { getCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string; documentId: string }> },
) {
  const user = await requireApiUser(_request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;
  if (!isBackendEnabled()) {
    return NextResponse.json({ error: 'Backend is not configured.' }, { status: 503 });
  }

  const { caseId, documentId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  const documents = await listBackendDocuments(caseId);
  const document = documents.find((doc) => doc.document_id === documentId);
  if (!document?.storage_uri) {
    return NextResponse.json({ error: 'Stored file not found' }, { status: 404 });
  }

  if (document.storage_uri.startsWith('drive://')) {
    const fileId = document.storage_uri.replace('drive://', '');
    return NextResponse.redirect(`https://drive.google.com/file/d/${fileId}/view`);
  }

  return NextResponse.json({ error: 'Unsupported storage location.' }, { status: 400 });
}
