import { requireApiUser } from '@/lib/auth/admin';
import { getCase } from '@/lib/kyb/storage';
import {
  listOpeningEmailStandardDocumentPackages,
  listOpeningEmailStandardDocuments,
  storeOpeningEmailUpload,
} from '@/lib/kyb/documentStorage';
import { buildOpeningEmailChecklist } from '@/lib/kyb/openingEmailChecklist';
import { ensureCaseDriveFolder } from '@/lib/kyb/driveFolders';
import { NextResponse } from 'next/server';
import { EMAIL_ATTACHMENT_TYPES, readValidatedUpload, UploadValidationError } from '@/lib/kyb/uploadSecurity';
import { safeErrorResponse } from '@/lib/api/errorResponse';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  try {
    // Client-facing email copy may be English or Chinese, but Antalpha sends one
    // standardized English version of every form/template.
    const attachmentContext = { ...caseData, language: 'en' as const };
    const packages = await listOpeningEmailStandardDocumentPackages(attachmentContext);
    const standard = packages.length
      ? packages.flatMap((item) => item.attachments)
      : await listOpeningEmailStandardDocuments();
    const checklist = buildOpeningEmailChecklist(caseData, standard);
    return NextResponse.json({ packages, standard, checklist });
  } catch (error) {
    console.warn('Opening email attachment templates could not be loaded.');
    return NextResponse.json({
      packages: [],
      standard: [],
      checklist: buildOpeningEmailChecklist(caseData, []),
      warning: 'Could not load standard attachments.',
    });
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
  let validatedData: Buffer;
  try {
    validatedData = await readValidatedUpload(file, EMAIL_ATTACHMENT_TYPES, MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof UploadValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  try {
    const driveFolderId = await ensureCaseDriveFolder(caseId);
    return NextResponse.json({ attachment: await storeOpeningEmailUpload(caseId, file, driveFolderId, validatedData) });
  } catch (error) {
    return safeErrorResponse('Opening-email attachment upload failed', error, 'Upload failed.');
  }
}
