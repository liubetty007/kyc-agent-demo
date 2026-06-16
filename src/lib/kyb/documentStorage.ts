import { Storage } from '@google-cloud/storage';

const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });

function bucket() {
  const name = process.env.KYC_DOCUMENT_BUCKET;
  if (!name) throw new Error('KYC_DOCUMENT_BUCKET is not configured.');
  return storage.bucket(name);
}

export async function storeCaseDocument(caseId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
  const objectName = `cases/${caseId}/${crypto.randomUUID()}-${safeName}`;
  await bucket().file(objectName).save(Buffer.from(await file.arrayBuffer()), {
    resumable: false,
    contentType: file.type || 'application/octet-stream',
    metadata: { cacheControl: 'private, no-store' },
  });
  return objectName;
}

export async function createDocumentDownloadUrl(objectName: string): Promise<string> {
  const [url] = await bucket().file(objectName).getSignedUrl({
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000,
  });
  return url;
}

