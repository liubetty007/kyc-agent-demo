import { Storage } from '@google-cloud/storage';

const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const OPENING_DOCS_PREFIX = process.env.KYC_OPENING_DOCS_PREFIX || 'kyc_agent_documents/';
const OPENING_DOCS_PREFIXES = Array.from(new Set([OPENING_DOCS_PREFIX, 'kyc_agent_documents/', '-kyc_agent_documents/']));

export type OpeningEmailAttachmentRef = {
  id: string;
  name: string;
  objectName: string;
  contentType?: string;
  size?: number;
  source: 'standard' | 'uploaded';
};

function bucket() {
  const name = process.env.KYC_DOCUMENT_BUCKET;
  if (!name) throw new Error('KYC_DOCUMENT_BUCKET is not configured.');
  return storage.bucket(name);
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'document';
}

function filenameFromObject(objectName: string): string {
  return objectName.split('/').filter(Boolean).at(-1) || objectName;
}

export async function storeCaseDocument(caseId: string, file: File): Promise<string> {
  const safeName = safeFilename(file.name);
  const objectName = `cases/${caseId}/${crypto.randomUUID()}-${safeName}`;
  await bucket().file(objectName).save(Buffer.from(await file.arrayBuffer()), {
    resumable: false,
    contentType: file.type || 'application/octet-stream',
    metadata: { cacheControl: 'private, no-store' },
  });
  return objectName;
}

export async function storeCaseDocumentBytes(input: {
  caseId: string;
  filename: string;
  contentType?: string;
  data: Buffer;
}): Promise<string> {
  const safeName = safeFilename(input.filename);
  const objectName = `cases/${input.caseId}/${crypto.randomUUID()}-${safeName}`;
  await bucket().file(objectName).save(input.data, {
    resumable: false,
    contentType: input.contentType || 'application/octet-stream',
    metadata: { cacheControl: 'private, no-store' },
  });
  return objectName;
}

export async function readCaseDocumentBytes(objectName: string): Promise<Buffer> {
  const [data] = await bucket().file(objectName).download();
  return data;
}

export async function listOpeningEmailStandardDocuments(): Promise<OpeningEmailAttachmentRef[]> {
  const fileGroups = await Promise.all(OPENING_DOCS_PREFIXES.map((prefix) => bucket().getFiles({ prefix })));
  const files = fileGroups.flatMap(([items]) => items);
  const folderNames = new Set(OPENING_DOCS_PREFIXES);
  const seen = new Set<string>();
  return files
    .filter((file) => {
      if (seen.has(file.name) || folderNames.has(file.name) || file.name.endsWith('/')) return false;
      seen.add(file.name);
      return true;
    })
    .map((file) => ({
      id: `standard:${file.name}`,
      name: filenameFromObject(file.name),
      objectName: file.name,
      contentType: file.metadata.contentType,
      size: Number(file.metadata.size || 0),
      source: 'standard' as const,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function storeOpeningEmailUpload(caseId: string, file: File): Promise<OpeningEmailAttachmentRef> {
  const safeName = safeFilename(file.name);
  const objectName = `cases/${caseId}/opening-email-attachments/${crypto.randomUUID()}-${safeName}`;
  await bucket().file(objectName).save(Buffer.from(await file.arrayBuffer()), {
    resumable: false,
    contentType: file.type || 'application/octet-stream',
    metadata: { cacheControl: 'private, no-store' },
  });
  return {
    id: `uploaded:${objectName}`,
    name: file.name,
    objectName,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    source: 'uploaded',
  };
}

export async function readOpeningEmailAttachment(caseId: string, attachment: OpeningEmailAttachmentRef): Promise<{
  filename: string;
  contentType?: string;
  data: Buffer;
}> {
  const uploadPrefix = `cases/${caseId}/opening-email-attachments/`;
  const isAllowedStandard = attachment.source === 'standard' && OPENING_DOCS_PREFIXES.some((prefix) => attachment.objectName.startsWith(prefix));
  const isAllowedUpload = attachment.source === 'uploaded' && attachment.objectName.startsWith(uploadPrefix);
  if (!isAllowedStandard && !isAllowedUpload) throw new Error('Attachment path is not allowed.');
  const file = bucket().file(attachment.objectName);
  const [metadata] = await file.getMetadata();
  const [data] = await file.download();
  return {
    filename: attachment.name || filenameFromObject(attachment.objectName),
    contentType: attachment.contentType || metadata.contentType,
    data,
  };
}

export async function createDocumentDownloadUrl(objectName: string): Promise<string> {
  const [url] = await bucket().file(objectName).getSignedUrl({
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000,
  });
  return url;
}
