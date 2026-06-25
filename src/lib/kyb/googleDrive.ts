import { Buffer } from 'buffer';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
let rootFolderIdPromise: Promise<string> | null = null;

export type DriveFileSummary = {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
};

function oauthClientId(): string {
  return process.env.GMAIL_CLIENT_ID || '';
}

function oauthClientSecret(): string {
  return process.env.GMAIL_CLIENT_SECRET || '';
}

function oauthRefreshToken(): string {
  return process.env.GMAIL_REFRESH_TOKEN || '';
}

async function googleAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: oauthClientId(),
      client_secret: oauthClientSecret(),
      refresh_token: oauthRefreshToken(),
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    throw new Error(`Google OAuth failed: ${response.status}`);
  }
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('Google OAuth did not return an access token.');
  return body.access_token;
}

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await googleAccessToken();
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text.trim() ? `: ${text.trim().slice(0, 400)}` : '';
    throw new Error(`Drive API request failed (${response.status})${detail}`);
  }
  return response;
}

function driveName(): string {
  return 'KYC文件';
}

async function findOrCreateRootFolder(): Promise<string> {
  if (!rootFolderIdPromise) {
    rootFolderIdPromise = (async () => {
      const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${driveName()}' and trashed=false and 'root' in parents`);
      const listResponse = await driveFetch(`/files?q=${query}&fields=files(id,name)&pageSize=10&spaces=drive`);
      const data = await listResponse.json() as { files?: Array<{ id?: string }> };
      const existing = data.files?.find((file) => file.id)?.id;
      if (existing) return existing;

      const createResponse = await driveFetch('/files?fields=id,name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: driveName(),
          mimeType: 'application/vnd.google-apps.folder',
          parents: ['root'],
        }),
      });
      const created = await createResponse.json() as { id?: string };
      if (!created.id) throw new Error('Drive folder creation did not return an id.');
      return created.id;
    })().catch((error) => {
      rootFolderIdPromise = null;
      throw error;
    });
  }
  return rootFolderIdPromise;
}

export async function ensureKycDriveFolder(): Promise<string> {
  return findOrCreateRootFolder();
}

export async function uploadBytesToDrive(input: {
  filename: string;
  contentType?: string;
  data: Buffer;
  parentId?: string;
}): Promise<{ id: string; name: string }> {
  const parentId = input.parentId || (await ensureKycDriveFolder());
  const boundary = `boundary_${crypto.randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, 'utf8'),
    Buffer.from(JSON.stringify({ name: input.filename, parents: [parentId] }), 'utf8'),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${input.contentType || 'application/octet-stream'}\r\n\r\n`, 'utf8'),
    input.data,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await googleAccessToken()}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text.trim() ? `: ${text.trim().slice(0, 400)}` : '';
    throw new Error(`Drive upload failed (${response.status})${detail}`);
  }
  const created = await response.json() as { id?: string; name?: string };
  if (!created.id) throw new Error('Drive upload did not return an id.');
  return { id: created.id, name: created.name || input.filename };
}

export async function createFolderOnDrive(name: string, parentId?: string): Promise<string> {
  const response = await driveFetch('/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId || 'root'],
    }),
  });
  const created = await response.json() as { id?: string };
  if (!created.id) throw new Error('Drive folder creation did not return an id.');
  return created.id;
}

export async function readBytesFromDrive(fileId: string): Promise<Buffer> {
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}?alt=media`, { method: 'GET' });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function readMetadataFromDrive(fileId: string): Promise<{ name?: string; mimeType?: string; size?: string }> {
  const response = await driveFetch(`/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`, { method: 'GET' });
  return response.json() as Promise<{ name?: string; mimeType?: string; size?: string }>;
}

async function listDriveChildren(parentId: string, mimeFilter: string): Promise<DriveFileSummary[]> {
  const files: DriveFileSummary[] = [];
  let pageToken = '';
  do {
    const query = encodeURIComponent(`"${parentId.replace(/"/g, '\\"')}" in parents and trashed=false and ${mimeFilter}`);
    const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const response = await driveFetch(`/files?q=${query}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=100&orderBy=folder,name_natural&spaces=drive${token}`);
    const body = await response.json() as { nextPageToken?: string; files?: DriveFileSummary[] };
    files.push(...(body.files || []).filter((file) => file.id && file.name));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return files;
}

export async function listDriveFolderFiles(parentId: string): Promise<DriveFileSummary[]> {
  return listDriveChildren(parentId, `mimeType!='application/vnd.google-apps.folder'`);
}

export async function listDriveSubfolders(parentId: string): Promise<DriveFileSummary[]> {
  return listDriveChildren(parentId, `mimeType='application/vnd.google-apps.folder'`);
}
