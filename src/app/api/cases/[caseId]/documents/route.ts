import { upsertReceivedDocument } from '@/lib/kyb/storage';
import { getCase } from '@/lib/kyb/storage';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { storeCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { ensureCaseDriveFolder } from '@/lib/kyb/driveFolders';
import { generateChecklist } from '@/lib/kyb/checklist';
import { createBackendDocument, isBackendEnabled, reviewBackendDocument } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';
import { DOCUMENT_UPLOAD_TYPES, readValidatedUpload, UploadValidationError } from '@/lib/kyb/uploadSecurity';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    const requirementId = String(form.get('requirementId') || '');
    if (!(file instanceof File) || !requirementId) return NextResponse.json({ error: 'File and requirement are required.' }, { status: 400 });
    if (!generateChecklist(caseData).some((item) => item.id === requirementId)) {
      return NextResponse.json({ error: 'Checklist requirement is invalid for this case.' }, { status: 400 });
    }
    let validatedData: Buffer;
    try {
      validatedData = await readValidatedUpload(file, DOCUMENT_UPLOAD_TYPES, 15 * 1024 * 1024);
    } catch (error) {
      if (error instanceof UploadValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }
    const driveFolderId = await ensureCaseDriveFolder(caseId);
    const storageObject = await storeCaseDocumentBytes({
      caseId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      data: validatedData,
      parentFolderId: driveFolderId,
    });
    const localDoc = {
      id: `${requirementId}-${Date.now()}`,
      requirementId,
      name: file.name,
      status: 'received',
      issueDate: String(form.get('issueDate') || '') || undefined,
      notes: `Uploaded by ${user.email}.`,
      source: 'manual',
      receivedAt: new Date().toISOString(),
      storageObject,
    } as const;
    const updated = await upsertReceivedDocument(caseId, localDoc);
    if (isBackendEnabled() && isBackendCaseId(caseId)) {
      try {
        const backendDoc = await createBackendDocument(caseId, {
          filename: file.name,
          storage_uri: storageObject,
        });
        if (backendDoc.document_id) {
          await reviewBackendDocument(caseId, backendDoc.document_id, {
            action: 'reclassify',
            doc_type: requirementId,
            note: `Uploaded from checklist item ${requirementId}.`,
          });
        }
      } catch {
        console.warn('Backend document sync failed; continuing with local document storage.');
      }
    }
    return NextResponse.json(updated);
  }
  if (user.role === 'client') return NextResponse.json({ error: 'Clients may upload files but cannot change review status.' }, { status: 403 });
  const body = await request.json() as { id?: unknown; requirementId?: unknown; status?: unknown; issueDate?: unknown; notes?: unknown };
  const id = typeof body.id === 'string' ? body.id : '';
  const requirementId = typeof body.requirementId === 'string' ? body.requirementId : '';
  const existing = caseData.receivedDocuments.find((doc) => doc.id === id && doc.requirementId === requirementId);
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const allowedStatuses = new Set(['received', 'needs_review', 'accepted', 'invalid']);
  if (typeof body.status !== 'string' || !allowedStatuses.has(body.status)) {
    return NextResponse.json({ error: 'Invalid review status.' }, { status: 400 });
  }
  const updated = await upsertReceivedDocument(caseId, {
    ...existing,
    status: body.status as typeof existing.status,
    issueDate: typeof body.issueDate === 'string' ? body.issueDate.slice(0, 64) : existing.issueDate,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : existing.notes,
  });
  if (!updated) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  return NextResponse.json(updated);
}
