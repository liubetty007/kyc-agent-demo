const EXTENSIONS_BY_MIME: Record<string, ReadonlySet<string>> = {
  'application/pdf': new Set(['.pdf']),
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/png': new Set(['.png']),
  'application/msword': new Set(['.doc']),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': new Set(['.docx']),
  'application/vnd.ms-excel': new Set(['.xls']),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': new Set(['.xlsx']),
  'text/plain': new Set(['.txt']),
  'text/csv': new Set(['.csv']),
};

const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const DOCUMENT_UPLOAD_TYPES = new Set(Object.keys(EXTENSIONS_BY_MIME));
export const ANALYSIS_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
export const EMAIL_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export class UploadValidationError extends Error {}

function hasPrefix(data: Buffer, prefix: Buffer): boolean {
  return data.length >= prefix.length && data.subarray(0, prefix.length).equals(prefix);
}

function hasZipSignature(data: Buffer): boolean {
  return data.length >= 4
    && data[0] === 0x50
    && data[1] === 0x4b
    && ((data[2] === 0x03 && data[3] === 0x04) || (data[2] === 0x05 && data[3] === 0x06));
}

function signatureMatches(data: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') return data.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  if (mimeType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png') return hasPrefix(data, PNG_SIGNATURE);
  if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') return hasPrefix(data, OLE_SIGNATURE);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return hasZipSignature(data) && data.includes(Buffer.from('[Content_Types].xml')) && data.includes(Buffer.from('word/'));
  }
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    return hasZipSignature(data) && data.includes(Buffer.from('[Content_Types].xml')) && data.includes(Buffer.from('xl/'));
  }
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    if (data.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(data);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function readValidatedUpload(
  file: File,
  allowedTypes: ReadonlySet<string>,
  maxBytes: number,
): Promise<Buffer> {
  if (!file.name || file.name.length > 255 || /[\u0000-\u001f\u007f]/.test(file.name)) {
    throw new UploadValidationError('Filename is invalid.');
  }
  if (file.size <= 0) throw new UploadValidationError('File is empty.');
  if (file.size > maxBytes) throw new UploadValidationError(`File exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`);

  const mimeType = file.type.toLowerCase();
  if (!allowedTypes.has(mimeType)) throw new UploadValidationError('File type is not allowed.');
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!EXTENSIONS_BY_MIME[mimeType]?.has(extension)) {
    throw new UploadValidationError('Filename extension does not match the declared file type.');
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length !== file.size || !signatureMatches(data, mimeType)) {
    throw new UploadValidationError('File content does not match the declared file type.');
  }
  return data;
}
