const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DEFAULT_PARENT = '1qkTqTWmMHO0febfYkFx4K-mmly5KPHcV';

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || '',
      client_secret: process.env.GMAIL_CLIENT_SECRET || '',
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`OAuth failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  if (!body.access_token) throw new Error('OAuth did not return access_token');
  return body.access_token;
}

async function driveFetch(path, init = {}) {
  const token = await accessToken();
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Drive failed: ${response.status} ${await response.text()}`);
  return response;
}

function escapeQuery(value) {
  return value.replace(/'/g, "\\'");
}

async function findChild(parentId, name, mimeType) {
  const query = encodeURIComponent(`'${escapeQuery(parentId)}' in parents and name='${escapeQuery(name)}' and mimeType='${mimeType}' and trashed=false`);
  const response = await driveFetch(`/files?q=${query}&fields=files(id,name)&pageSize=1&spaces=drive`);
  const body = await response.json();
  return body.files?.[0]?.id || '';
}

async function ensureFolder(parentId, name) {
  const existing = await findChild(parentId, name, 'application/vnd.google-apps.folder');
  if (existing) return existing;
  const response = await driveFetch('/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  const body = await response.json();
  return body.id;
}

async function uploadTextFile(parentId, name, text) {
  const existing = await findChild(parentId, name, 'text/plain');
  if (existing) return existing;

  const token = await accessToken();
  const boundary = `boundary_${crypto.randomUUID()}`;
  const file = Buffer.from(text, 'utf8');
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(JSON.stringify({ name, parents: [parentId], mimeType: 'text/plain' })),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(payload.length),
    },
    body: payload,
  });
  if (!response.ok) throw new Error(`Drive upload failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return body.id;
}

const parentId = process.env.KYC_STANDARD_DRIVE_FOLDER_ID || DEFAULT_PARENT;
// Prefer KYC文件/标准模板 when uploading NS test templates.
const templatesRoot = await ensureFolder(parentId, '标准模板');
const folderId = await ensureFolder(templatesRoot, 'NS KYC文件');
const files = [
  [
    'NS_NDA_Fake_Template.txt',
    `NS Mutual Non-Disclosure Agreement Fake Template

Company Name:
Authorized Signatory:
Effective Date:
Signature:

This is a fake template for KYC Agent testing only.`,
  ],
  [
    'NS_BR_Fake_Template.txt',
    `NS Board Resolution Fake Template

Company Name:
Resolution Date:
Resolved: the company authorizes opening and maintaining NS related business with Antalpha.
Director Name:
Signature:

This is a fake template for KYC Agent testing only.`,
  ],
];

for (const [name, text] of files) {
  const fileId = await uploadTextFile(folderId, name, text);
  console.log(`${name}: ${fileId}`);
}
console.log(`NS KYC文件 folder: ${folderId}`);
