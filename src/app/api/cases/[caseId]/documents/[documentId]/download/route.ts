import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { createDocumentDownloadUrl, readCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { readMetadataFromDrive } from '@/lib/kyb/googleDrive';
import { getCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string; documentId: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const { caseId, documentId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  const document = caseData.receivedDocuments.find((item) => item.id === documentId);
  if (!document?.storageObject) return NextResponse.json({ error: 'Stored file not found' }, { status: 404 });
  if (document.storageObject.startsWith('drive://')) {
    const fileId = document.storageObject.replace('drive://', '');
    const [metadata, data] = await Promise.all([readMetadataFromDrive(fileId), readCaseDocumentBytes(document.storageObject)]);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${(metadata.name || document.name || 'document').replace(/"/g, '\\"')}"`,
      },
    });
  }
  return NextResponse.redirect(await createDocumentDownloadUrl(document.storageObject));
}
