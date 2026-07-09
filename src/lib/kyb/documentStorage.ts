import { Storage } from '@google-cloud/storage';
import {
  ensureKycDriveFolder,
  ensureKycTemplatesFolder,
  listDriveFolderFiles,
  listDriveSubfolders,
  readBytesFromDrive,
  readMetadataFromDrive,
  uploadBytesToDrive,
  type DriveFileSummary,
} from './googleDrive';
import type { KYCCase } from './types';
import { STANDARD_DRIVE_TEMPLATES } from './standardDriveTemplates';
import {
  OPENING_EMAIL_PACKAGE_DEFINITIONS,
  packageDefaultSelected,
  packageDescription,
  packageDefinitionForFolder,
} from './openingEmailPackages';
import {
  classifyTemplateDocumentSlug,
  detectTemplateLocale,
  matchesLocaleFolderName,
  templateDocumentLabel,
  templateLocaleFolder,
  type TemplateLocaleFolder,
} from './templateDocumentCatalog';

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

type StandardPackageCaseContext = Pick<KYCCase, 'jurisdiction' | 'businessType' | 'needsNsBusiness' | 'language'>;

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

async function resolveStandardDriveFolderId(): Promise<string> {
  if (process.env.KYC_STANDARD_DRIVE_FOLDER_ID) {
    return process.env.KYC_STANDARD_DRIVE_FOLDER_ID;
  }
  if (process.env.KYC_DRIVE_TEMPLATES_FOLDER_ID) {
    return process.env.KYC_DRIVE_TEMPLATES_FOLDER_ID;
  }
  return ensureKycTemplatesFolder();
}

function driveAttachment(
  file: { id: string; name: string; mimeType?: string; size?: string },
  packageId: string,
  packageName: string,
  displayName?: string,
): OpeningEmailAttachmentRef {
  return {
    id: `standard-drive:${file.id}`,
    name: displayName || file.name,
    objectName: `drive://${file.id}`,
    contentType: file.mimeType,
    size: Number(file.size || 0),
    source: 'standard',
    packageId,
    packageName,
  };
}

function pickLatestDriveFile(files: DriveFileSummary[]): DriveFileSummary | undefined {
  if (!files.length) return undefined;
  return [...files].sort((a, b) => (b.modifiedTime || '').localeCompare(a.modifiedTime || '') || a.name.localeCompare(b.name))[0];
}

async function findLocaleFolder(parentId: string, locale: TemplateLocaleFolder): Promise<DriveFileSummary | undefined> {
  const subfolders = await listDriveSubfolders(parentId);
  return subfolders.find((folder) => matchesLocaleFolderName(folder.name, locale));
}

async function attachmentsFromStructuredPackage(
  packageFolder: DriveFileSummary,
  caseData?: StandardPackageCaseContext,
): Promise<OpeningEmailAttachmentRef[]> {
  const locale = templateLocaleFolder(caseData?.language);
  const packageId = `drive-folder:${packageFolder.id}`;
  const documentFolders = (await listDriveSubfolders(packageFolder.id))
    .filter((folder) => !matchesLocaleFolderName(folder.name, 'EN') && !matchesLocaleFolderName(folder.name, 'ZH'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!documentFolders.length) return [];

  const attachments: OpeningEmailAttachmentRef[] = [];
  for (const documentFolder of documentFolders) {
    const localeFolder = await findLocaleFolder(documentFolder.id, locale);
    if (!localeFolder) continue;
    const latest = pickLatestDriveFile(await listDriveFolderFiles(localeFolder.id));
    if (!latest) continue;
    const slug = documentFolder.name;
    attachments.push(
      driveAttachment(
        latest,
        packageId,
        packageFolder.name,
        templateDocumentLabel(slug, caseData?.language),
      ),
    );
  }
  return attachments;
}

async function attachmentsFromFlatPackage(
  packageFolder: DriveFileSummary,
  caseData?: StandardPackageCaseContext,
): Promise<OpeningEmailAttachmentRef[]> {
  const locale = templateLocaleFolder(caseData?.language);
  const packageId = `drive-folder:${packageFolder.id}`;
  const files = (await listDriveFolderFiles(packageFolder.id)).filter((file) => file.name.toLowerCase() !== 'manifest.json');
  const grouped = new Map<string, DriveFileSummary[]>();

  for (const file of files) {
    if (detectTemplateLocale(file.name) !== locale) continue;
    const slug = classifyTemplateDocumentSlug(file.name, packageFolder.name);
    const bucket = grouped.get(slug) || [];
    bucket.push(file);
    grouped.set(slug, bucket);
  }

  return [...grouped.entries()]
    .map(([slug, bucket]) => {
      const latest = pickLatestDriveFile(bucket);
      if (!latest) return null;
      return driveAttachment(latest, packageId, packageFolder.name, templateDocumentLabel(slug, caseData?.language));
    })
    .filter((item): item is OpeningEmailAttachmentRef => Boolean(item))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mappedStandardDriveAttachments(): OpeningEmailAttachmentPackage[] {
  const grouped = new Map<string, OpeningEmailAttachmentPackage>();
  for (const template of STANDARD_DRIVE_TEMPLATES) {
    const packageId = `mapped:${template.packageName}`;
    const existing = grouped.get(packageId) || {
      id: packageId,
      name: template.packageName,
      description: packageDescription(template.packageName),
      defaultSelected: template.defaultSelected,
      attachments: [],
    };
    existing.defaultSelected = existing.defaultSelected || template.defaultSelected;
    existing.attachments.push({
      id: `standard-drive:${template.driveFileId}`,
      name: template.displayName,
      objectName: `drive://${template.driveFileId}`,
      source: 'standard',
      packageId,
      packageName: template.packageName,
    });
    grouped.set(packageId, existing);
  }

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      attachments: item.attachments.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const orderA = packageDefinitionForFolder(a.name)?.sortOrder || 99;
      const orderB = packageDefinitionForFolder(b.name)?.sortOrder || 99;
      if (orderA !== orderB) return orderA - orderB;
      if (a.defaultSelected !== b.defaultSelected) return a.defaultSelected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
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

async function packageFromFolder(folder: DriveFileSummary, caseData?: StandardPackageCaseContext): Promise<OpeningEmailAttachmentPackage | null> {
  if (folder.name.startsWith('_')) return null;

  const structured = await attachmentsFromStructuredPackage(folder, caseData);
  const attachments = structured.length
    ? structured
    : await attachmentsFromFlatPackage(folder, caseData);

  if (!attachments.length) return null;
  const packageId = `drive-folder:${folder.id}`;
  return {
    id: packageId,
    name: folder.name,
    description: packageDescription(folder.name),
    defaultSelected: packageDefaultSelected(folder.name, caseData),
    attachments,
  };
}

export async function listOpeningEmailStandardDocumentPackages(caseData?: StandardPackageCaseContext): Promise<OpeningEmailAttachmentPackage[]> {
  const folderId = await resolveStandardDriveFolderId();

  try {
    const subfolders = (await listDriveSubfolders(folderId))
      .filter((folder) => !folder.name.startsWith('_'))
      .sort((a, b) => {
        const orderA = packageDefinitionForFolder(a.name)?.sortOrder || OPENING_EMAIL_PACKAGE_DEFINITIONS.length + 1;
        const orderB = packageDefinitionForFolder(b.name)?.sortOrder || OPENING_EMAIL_PACKAGE_DEFINITIONS.length + 1;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });

    const packages: OpeningEmailAttachmentPackage[] = [];
    for (const folder of subfolders) {
      const directPackage = await packageFromFolder(folder, caseData);
      if (directPackage) packages.push(directPackage);
    }

    if (packages.length) {
      return packages.sort((a, b) => {
        const orderA = packageDefinitionForFolder(a.name)?.sortOrder || 99;
        const orderB = packageDefinitionForFolder(b.name)?.sortOrder || 99;
        if (orderA !== orderB) return orderA - orderB;
        if (a.defaultSelected !== b.defaultSelected) return a.defaultSelected ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
  } catch {
    // Fall back to static Drive template IDs when the configured folder is unavailable.
  }

  return mappedStandardDriveAttachments();
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
