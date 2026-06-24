import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { analyzeCaseDocument, llmProviderLabel } from '@/lib/kyb/documentAnalysis';
import { readCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { getCase } from '@/lib/kyb/storage';

function collectFiles(form: FormData): File[] {
  const files = form.getAll('files').filter((item): item is File => item instanceof File);
  const single = form.get('file');
  if (single instanceof File) files.unshift(single);
  return files;
}

function collectDocumentIds(form: FormData): string[] {
  return form.getAll('documentIds').map((value) => String(value || '').trim()).filter(Boolean);
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart/form-data is required.' }, { status: 400 });
  }

  const form = await request.formData();
  const files = collectFiles(form);
  const requestedDocumentIds = collectDocumentIds(form);

  const analyses = [];
  if (files.length) {
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json({ error: `${file.name} exceeds the 20 MB limit.` }, { status: 400 });
      }

      const data = Buffer.from(await file.arrayBuffer());
      const analysis = await analyzeCaseDocument({
        caseData,
        filename: file.name,
        mimeType: file.type || undefined,
        content: data,
      });
      analyses.push(analysis);
    }
    return NextResponse.json({
      provider: llmProviderLabel(),
      analyses,
    });
  }

  const receivedDocuments = (requestedDocumentIds.length
    ? caseData.receivedDocuments.filter((doc) => requestedDocumentIds.includes(doc.id))
    : caseData.receivedDocuments
  ).filter((doc) => Boolean(doc.storageObject));

  if (!receivedDocuments.length) {
    return NextResponse.json({ error: 'No checklist files are available to analyze.' }, { status: 400 });
  }

  for (const doc of receivedDocuments) {
    const storageObject = doc.storageObject || '';
    const data = await readCaseDocumentBytes(storageObject);
    const analysis = await analyzeCaseDocument({
      caseData,
      filename: doc.name,
      content: data,
      storageObject,
    });
    analyses.push({
      ...analysis,
      storageObject,
    });
  }

  return NextResponse.json({
    provider: llmProviderLabel(),
    analyses,
  });
}
