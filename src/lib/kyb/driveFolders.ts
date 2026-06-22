import type { KYCCase } from './types';
import { createFolderOnDrive, ensureKycDriveFolder } from './googleDrive';
import { getCase, updateCase } from './storage';

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'KYC case';
}

export async function ensureCaseDriveFolder(caseId: string): Promise<string> {
  const caseData = await getCase(caseId);
  if (!caseData) throw new Error('Case not found');
  if (caseData.driveFolderId) return caseData.driveFolderId;

  const rootFolderId = await ensureKycDriveFolder();
  const folderName = sanitizeFolderName(`${caseData.companyName || 'KYC case'} - ${caseData.id}`);
  const id = await createFolderOnDrive(folderName, rootFolderId);
  await updateCase(caseId, { driveFolderId: id });
  return id;
}

export function driveFileId(storageObject?: string): string | null {
  if (!storageObject?.startsWith('drive://')) return null;
  return storageObject.replace('drive://', '');
}
