import { requireApiUser } from '@/lib/auth/admin';
import { canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { storeClientEmailUpload } from '@/lib/kyb/documentStorage';
import { getCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';
import { EMAIL_ATTACHMENT_TYPES, readValidatedUpload, UploadValidationError } from '@/lib/kyb/uploadSecurity';
import { safeErrorResponse } from '@/lib/api/errorResponse';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;
  if (!canPerformKycOperations(user) && !canSubmitComplianceDecision(user)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  try {
    const validatedData = await readValidatedUpload(file, EMAIL_ATTACHMENT_TYPES, MAX_UPLOAD_BYTES);
    const attachment = await storeClientEmailUpload(caseId, file, validatedData);
    return NextResponse.json({ attachment });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return safeErrorResponse('Client-email attachment upload failed', error, 'Upload failed.', 502);
  }
}
