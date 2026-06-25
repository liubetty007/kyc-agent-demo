import type { KYCCase } from './types';

export type EmailAttachmentPart = {
  filename: string;
  contentType?: string;
  data: Buffer;
};

function safeArchiveName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document';
}

function uniqueArchiveName(filename: string, used: Set<string>): string {
  const safe = safeArchiveName(filename);
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }

  const dotIndex = safe.lastIndexOf('.');
  const base = dotIndex > 0 ? safe.slice(0, dotIndex) : safe;
  const ext = dotIndex > 0 ? safe.slice(dotIndex) : '';
  let index = 2;
  while (used.has(`${base} (${index})${ext}`)) index += 1;
  const unique = `${base} (${index})${ext}`;
  used.add(unique);
  return unique;
}

function complianceArchiveFilename(caseData: Pick<KYCCase, 'companyName' | 'id'>): string {
  return `${safeArchiveName(caseData.companyName)}-${caseData.id}-accepted-kyc-files.zip`;
}

export function acceptedDocumentNames(caseData: KYCCase): string[] {
  return caseData.receivedDocuments
    .filter((doc) => doc.status === 'accepted')
    .map((doc) => doc.name);
}

export async function loadAcceptedDocumentAttachments(caseData: KYCCase): Promise<EmailAttachmentPart[]> {
  const accepted = caseData.receivedDocuments.filter((doc) => doc.status === 'accepted' && doc.storageObject);
  if (!accepted.length) return [];

  const { readCaseDocumentBytes } = await import('./documentStorage');
  const attachments: EmailAttachmentPart[] = [];
  for (const doc of accepted) {
    if (!doc.storageObject) continue;
    try {
      attachments.push({
        filename: doc.name,
        data: await readCaseDocumentBytes(doc.storageObject),
      });
    } catch {
      // Skip unreadable storage objects.
    }
  }
  return attachments;
}

export async function loadAcceptedDocumentsZipAttachment(caseData: KYCCase): Promise<EmailAttachmentPart | null> {
  const accepted = caseData.receivedDocuments.filter((doc) => doc.status === 'accepted' && doc.storageObject);
  if (!accepted.length) return null;

  const [{ readCaseDocumentBytes }, JSZipModule] = await Promise.all([
    import('./documentStorage'),
    import('jszip'),
  ]);
  const zip = new JSZipModule.default();
  const usedNames = new Set<string>();
  let added = 0;

  for (const doc of accepted) {
    if (!doc.storageObject) continue;
    try {
      const data = await readCaseDocumentBytes(doc.storageObject);
      zip.file(uniqueArchiveName(doc.name, usedNames), data);
      added += 1;
    } catch {
      // Skip unreadable storage objects; the email body still lists accepted docs.
    }
  }

  if (!added) return null;
  const data = await zip.generateAsync({ type: 'nodebuffer' });
  return {
    filename: complianceArchiveFilename(caseData),
    contentType: 'application/zip',
    data,
  };
}

export async function backendAcceptedDocumentNames(caseId: string): Promise<string[]> {
  const { isBackendEnabled, listBackendDocuments } = await import('@/lib/kyc-backend/client');
  if (!isBackendEnabled()) return [];
  const documents = await listBackendDocuments(caseId);
  return documents.filter((doc) => doc.review.status === 'accepted').map((doc) => doc.filename);
}
