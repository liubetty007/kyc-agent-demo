import { Storage } from '@google-cloud/storage';
import {
  ensureKycDriveFolder,
  listDriveFolderFiles,
  listDriveSubfolders,
  readBytesFromDrive,
  readMetadataFromDrive,
  uploadBytesToDrive,
} from './googleDrive';

const storage = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const OPENING_DOCS_PREFIX = process.env.KYC_OPENING_DOCS_PREFIX || 'kyc_agent_documents/';
const OPENING_DOCS_PREFIXES = Array.from(new Set([OPENING_DOCS_PREFIX, 'kyc_agent_documents/', '-kyc_agent_documents/']));
const DEFAULT_STANDARD_DRIVE_FOLDER_ID = '1qkTqTWmMHO0febfYkFx4K-mmly5KPHcV';

export type OpeningEmailAttachmentRef = {
  id: string;
  name: string;
  objectName: string;
  contentType?: string;
  size?: number;
  source: 'standard' | 'uploaded';
  packageId?: string;
  packageName?: string;
};

export type OpeningEmailAttachmentPackage = {
  id: string;
  name: string;
  description: string;
  defaultSelected: boolean;
  attachments: OpeningEmailAttachmentRef[];
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

function standardDriveFolderId(): string | undefined {
  return process.env.KYC_STANDARD_DRIVE_FOLDER_ID || DEFAULT_STANDARD_DRIVE_FOLDER_ID;
}

function driveAttachment(file: { id: string; name: string; mimeType?: string; size?: string }, packageId: string, packageName: string): OpeningEmailAttachmentRef {
  return {
    id: `standard-drive:${file.id}`,
    name: file.name,
    objectName: `drive://${file.id}`,
    contentType: file.mimeType,
    size: Number(file.size || 0),
    source: 'standard',
    packageId,
    packageName,
  };
}

export async function storeCaseDocument(caseId: string, file: File): Promise<string> {
  return storeCaseDocumentBytes({
    caseId,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    data: Buffer.from(await file.arrayBuffer()),
  });
}

export async function storeCaseDocumentBytes(input: {
  caseId: string;
  filename: string;
  contentType?: string;
  data: Buffer;
  parentFolderId?: string;
}): Promise<string> {
  const folderId = input.parentFolderId || (await ensureKycDriveFolder());
  const uploaded = await uploadBytesToDrive({
    filename: `${input.caseId} - ${safeFilename(input.filename)}`,
    contentType: input.contentType,
    data: input.data,
    parentId: folderId,
  });
  return `drive://${uploaded.id}`;
}

export async function readCaseDocumentBytes(objectName: string): Promise<Buffer> {
  if (objectName.startsWith('drive://')) {
    return readBytesFromDrive(objectName.replace('drive://', ''));
  }
  const [data] = await bucket().file(objectName).download();
  return data;
}

export async function listOpeningEmailStandardDocuments(): Promise<OpeningEmailAttachmentRef[]> {
  const packages = await listOpeningEmailStandardDocumentPackages();
  if (packages.length) return packages.flatMap((item) => item.attachments);

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
      packageId: 'cloud-storage-standard',
      packageName: 'Cloud Storage standard files',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listOpeningEmailStandardDocumentPackages(): Promise<OpeningEmailAttachmentPackage[]> {
  const folderId = standardDriveFolderId();
  if (!folderId) return [];

  const rootFiles = await listDriveFolderFiles(folderId);
  const packages: OpeningEmailAttachmentPackage[] = [];
  const rootPackageId = `drive-folder:${folderId}`;
  if (rootFiles.length) {
    packages.push({
      id: rootPackageId,
      name: 'KYC标准文件',
      description: '每次开户邮件必发文件',
      defaultSelected: true,
      attachments: rootFiles
        .map((file) => driveAttachment(file, rootPackageId, 'KYC标准文件'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  const subfolders = await listDriveSubfolders(folderId);
  for (const folder of subfolders) {
    const files = await listDriveFolderFiles(folder.id);
    if (!files.length) continue;
    const packageId = `drive-folder:${folder.id}`;
    packages.push({
      id: packageId,
      name: folder.name,
      description: '按地区或场景选择的开户文件夹',
      defaultSelected: false,
      attachments: files
        .map((file) => driveAttachment(file, packageId, folder.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return packages.sort((a, b) => {
    if (a.defaultSelected !== b.defaultSelected) return a.defaultSelected ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function storeOpeningEmailUpload(
  caseId: string,
  file: File,
  parentFolderId?: string,
): Promise<OpeningEmailAttachmentRef> {
  const uploaded = await uploadBytesToDrive({
    filename: `${caseId} - ${safeFilename(file.name)}`,
    contentType: file.type || 'application/octet-stream',
    data: Buffer.from(await file.arrayBuffer()),
    parentId: parentFolderId || (await ensureKycDriveFolder()),
  });
  const objectName = `drive://${uploaded.id}`;
  return {
    id: `uploaded:${uploaded.id}`,
    name: file.name,
    objectName,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    source: 'uploaded',
  };
}

export type ClientEmailAttachmentRef = {
  id: string;
  name: string;
  objectName: string;
  contentType?: string;
  size?: number;
};

export async function storeClientEmailUpload(caseId: string, file: File): Promise<ClientEmailAttachmentRef> {
  const safeName = safeFilename(file.name);
  const objectName = `cases/${caseId}/client-email-attachments/${crypto.randomUUID()}-${safeName}`;
  await bucket().file(objectName).save(Buffer.from(await file.arrayBuffer()), {
    resumable: false,
    contentType: file.type || 'application/octet-stream',
    metadata: { cacheControl: 'private, no-store' },
  });
  return {
    id: `client-email:${objectName}`,
    name: file.name,
    objectName,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  };
}

export async function readClientEmailUpload(caseId: string, attachment: ClientEmailAttachmentRef): Promise<{
  filename: string;
  contentType?: string;
  data: Buffer;
}> {
  const prefix = `cases/${caseId}/client-email-attachments/`;
  if (!attachment.objectName.startsWith(prefix)) throw new Error('Attachment path is not allowed.');
  const file = bucket().file(attachment.objectName);
  const [metadata] = await file.getMetadata();
  const [data] = await file.download();
  return {
    filename: attachment.name || filenameFromObject(attachment.objectName),
    contentType: attachment.contentType || metadata.contentType,
    data,
  };
}

export async function readOpeningEmailAttachment(caseId: string, attachment: OpeningEmailAttachmentRef): Promise<{
  filename: string;
  contentType?: string;
  data: Buffer;
}> {
  const uploadPrefix = `drive://`;
  const isAllowedStandard = attachment.source === 'standard' && OPENING_DOCS_PREFIXES.some((prefix) => attachment.objectName.startsWith(prefix));
  const isAllowedDriveStandard = attachment.source === 'standard'
    && attachment.objectName.startsWith(uploadPrefix)
    && (await listOpeningEmailStandardDocuments()).some((item) => item.objectName === attachment.objectName);
  const isAllowedUpload = attachment.source === 'uploaded' && attachment.objectName.startsWith(uploadPrefix);
  if (!isAllowedStandard && !isAllowedDriveStandard && !isAllowedUpload) throw new Error('Attachment path is not allowed.');
  if (attachment.objectName.startsWith('drive://')) {
    const fileId = attachment.objectName.replace('drive://', '');
    const [metadata, data] = await Promise.all([readMetadataFromDrive(fileId), readBytesFromDrive(fileId)]);
    return {
      filename: attachment.name || metadata.name || filenameFromObject(attachment.objectName),
      contentType: attachment.contentType || metadata.mimeType,
      data,
    };
  }
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
  if (objectName.startsWith('drive://')) {
    return `https://drive.google.com/uc?id=${objectName.replace('drive://', '')}&export=download`;
  }
  const [url] = await bucket().file(objectName).getSignedUrl({
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000,
  });
  return url;
}
