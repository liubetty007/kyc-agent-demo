import type { KYCCase } from './types';

export type EmailAttachmentPart = {
  filename: string;
  contentType?: string;
  data: Buffer;
};

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

export async function backendAcceptedDocumentNames(caseId: string): Promise<string[]> {
  const { isBackendEnabled, listBackendDocuments } = await import('@/lib/kyc-backend/client');
  if (!isBackendEnabled()) return [];
  const documents = await listBackendDocuments(caseId);
  return documents.filter((doc) => doc.review.status === 'accepted').map((doc) => doc.filename);
}
