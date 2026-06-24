import { requireApiUser } from '@/lib/auth/admin';
import { getCase } from '@/lib/kyb/storage';
import {
  listOpeningEmailStandardDocumentPackages,
  listOpeningEmailStandardDocuments,
  storeOpeningEmailUpload,
} from '@/lib/kyb/documentStorage';
import { ensureCaseDriveFolder } from '@/lib/kyb/driveFolders';
import { NextResponse } from 'next/server';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  try {
    const packages = await listOpeningEmailStandardDocumentPackages(caseData);
    const standard = packages.length
      ? packages.flatMap((item) => item.attachments)
      : await listOpeningEmailStandardDocuments();
    return NextResponse.json({ packages, standard });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load attachments.' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Use multipart/form-data.' }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'File is required.' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'File exceeds the 15 MB limit.' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Only PDF, Word, Excel, JPEG, and PNG files are allowed.' }, { status: 400 });

  try {
    const driveFolderId = await ensureCaseDriveFolder(caseId);
    return NextResponse.json({ attachment: await storeOpeningEmailUpload(caseId, file, driveFolderId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 });
  }
}
