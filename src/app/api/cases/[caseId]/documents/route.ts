import { upsertReceivedDocument } from '@/lib/kyb/storage';
import { getCase } from '@/lib/kyb/storage';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { storeCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { ensureCaseDriveFolder } from '@/lib/kyb/driveFolders';
import { createBackendDocument, isBackendEnabled, reviewBackendDocument } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

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
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds the 15 MB limit.' }, { status: 400 });
    const allowedTypes = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]);
    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Only PDF, Word, Excel, TXT, CSV, JPEG, and PNG files are allowed.' }, { status: 400 });
    }
    const driveFolderId = await ensureCaseDriveFolder(caseId);
    const storageObject = await storeCaseDocumentBytes({
      caseId,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      data: Buffer.from(await file.arrayBuffer()),
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
      } catch (error) {
        console.warn('Backend document sync failed:', error);
      }
    }
    return NextResponse.json(updated);
  }
  if (user.role === 'client') return NextResponse.json({ error: 'Clients may upload files but cannot change review status.' }, { status: 403 });
  const body = await request.json();
  const updated = await upsertReceivedDocument(caseId, {
    id: body.id || `${body.requirementId}-${Date.now()}`,
    requirementId: body.requirementId,
    name: body.name,
    status: body.status || 'received',
    issueDate: body.issueDate || undefined,
    notes: body.notes || undefined,
    source: body.source || undefined,
    fromEmail: body.fromEmail || undefined,
    emailSubject: body.emailSubject || undefined,
    receivedAt: body.receivedAt || undefined,
    confidence: body.confidence || undefined,
    storageObject: body.storageObject || undefined,
  });
  if (!updated) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  return NextResponse.json(updated);
}
