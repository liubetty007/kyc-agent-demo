/**
 * Reorganize Betty demo template Drive into opening-email packages:
 *   01 标准必交文件 | 02 NS Documents | 03 Hong Kong | 04 Singapore | 05 United States | 06 Others
 *
 * Usage:
 *   BETTY_DRIVE=1 node scripts/reorganize-betty-template-folders.mjs --dry-run
 *   BETTY_DRIVE=1 node scripts/reorganize-betty-template-folders.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'kyc-agent-staging-20260610';
const BETTY = JSON.parse(readFileSync(new URL('../config/betty-drive.defaults.json', import.meta.url), 'utf8'));

const PACKAGE_NAMES = [
  '01 标准必交文件',
  '02 NS Documents',
  '03 Hong Kong',
  '04 Singapore',
  '05 United States',
  '06 Others',
];

const PRIME_COPIES = [
  { fileId: '1iQ5OmHhiUl4OrF_cUUHIl_NEqnAPVky1', target: '01 标准必交文件', name: 'Authorization Letter_授權書.pdf' },
  { fileId: '1AgJOlBJhSn8qay2Gcrl6U2Z5jUaNnFla', target: '01 标准必交文件', name: 'Institution Onboarding Form_機構開戶申請表.pdf' },
  { fileId: '1zkmdEmsU0vZPnkusg_sMRf5S17l78YaI', target: '01 标准必交文件', name: 'Board Resolution_董事決議書.pdf' },
  { fileId: '1eDvSFxD1t1j5bxvohz4qlPvNIAAkLZaX', target: '01 标准必交文件', name: 'Mutual Confidentiality Agreement (NDA)_保密協議.pdf' },
  { fileId: '1jYSiWt9mKJW3ETeiCTbNG0X3-PpnfcKC', target: '01 标准必交文件', name: 'Source of Funds Template_資金來源聲明模板.pdf' },
  { fileId: '1KMZmfBIqRklkqB4vUgJ7UJDbOfiQ78kz', target: '02 NS Documents', name: 'Board Resolution_董事決議書_Northstar.pdf' },
  { fileId: '1dMbIdcwFZl8P0lzhjBI-F9G9Q_2DEmVO', target: '02 NS Documents', name: 'Mutual Confidentiality Agreement (NDA)_保密協議_Northstar.pdf' },
  { fileId: '1Un1aLveqvvX4tfGsL7C3K36beHpKlHue', target: '03 Hong Kong', name: 'Non-US Person & Non-solicitation in HK Confirmation.pdf' },
];

function secret(name) {
  if (process.env[name]) return process.env[name];
  try {
    return execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${PROJECT_ID}`], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: secret('gmail-client-id') || process.env.GMAIL_CLIENT_ID || '',
      client_secret: secret('gmail-client-secret') || process.env.GMAIL_CLIENT_SECRET || '',
      refresh_token: secret('gmail-refresh-token') || process.env.GMAIL_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`OAuth failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  if (!body.access_token) throw new Error('OAuth did not return access_token');
  return body.access_token;
}

async function driveFetch(token, path, init = {}) {
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Drive ${response.status}: ${(await response.text()).slice(0, 500)}`);
  if (response.status === 204) return null;
  return response.json();
}

function escapeQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listChildren(token, parentId) {
  const q = encodeURIComponent(`'${escapeQuery(parentId)}' in parents and trashed=false`);
  const body = await driveFetch(token, `/files?q=${q}&fields=files(id,name,mimeType)&pageSize=200&orderBy=folder,name_natural&spaces=drive`);
  return body.files || [];
}

async function findChild(token, parentId, name, mimeType = 'application/vnd.google-apps.folder') {
  const q = encodeURIComponent(
    `'${escapeQuery(parentId)}' in parents and name='${escapeQuery(name)}' and mimeType='${mimeType}' and trashed=false`,
  );
  const body = await driveFetch(token, `/files?q=${q}&fields=files(id,name)&pageSize=1&spaces=drive`);
  return body.files?.[0]?.id || '';
}

async function ensureFolder(token, parentId, name) {
  const existing = await findChild(token, parentId, name);
  if (existing) return existing;
  if (DRY_RUN) {
    console.log(`[dry-run] create folder ${name}`);
    return `dry-${name}`;
  }
  const created = await driveFetch(token, '/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  return created.id;
}

async function moveFile(token, fileId, fromParentId, toParentId) {
  if (DRY_RUN) {
    console.log(`[dry-run] move ${fileId} -> ${toParentId}`);
    return;
  }
  await driveFetch(
    token,
    `/files/${fileId}?addParents=${encodeURIComponent(toParentId)}&removeParents=${encodeURIComponent(fromParentId)}&fields=id,parents`,
    { method: 'PATCH' },
  );
}

async function findFileByName(token, parentId, name) {
  const q = encodeURIComponent(
    `'${escapeQuery(parentId)}' in parents and name='${escapeQuery(name)}' and mimeType!='application/vnd.google-apps.folder' and trashed=false`,
  );
  const body = await driveFetch(token, `/files?q=${q}&fields=files(id,name)&pageSize=1&spaces=drive`);
  return body.files?.[0]?.id || '';
}

async function copyFile(token, fileId, name, parentId) {
  const existing = await findFileByName(token, parentId, name);
  if (existing) {
    console.log(`skip copy (exists): ${name}`);
    return existing;
  }
  if (DRY_RUN) {
    console.log(`[dry-run] copy ${name} -> ${parentId}`);
    return `dry-copy-${name}`;
  }
  const created = await driveFetch(token, `/files/${fileId}/copy?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [parentId] }),
  });
  return created.id;
}

function classifyByName(name) {
  const lower = name.toLowerCase().replace(/[_-]+/g, ' ');
  if (/ns[_\s-]?(br|nda)|northstar|北星/.test(lower)) return '02 NS Documents';
  if (/^hk_|hong kong|non-us.*hk|nnc1|nar1|nd2a|香港/.test(lower)) return '03 Hong Kong';
  if (/^sg_|singapore|acra|新加坡/.test(lower)) return '04 Singapore';
  if (/^us_|united states|wyoming|delaware|nevada|california|texas|new york|w9|美国/.test(lower)) return '05 United States';
  if (/authorization|onboarding|board resolution|mutual.*nda|nda|授权|开户|董事决议|保密|source of funds|资金/.test(lower)) {
    return '01 标准必交文件';
  }
  return '06 Others';
}

async function walkAndCollect(token, folderId, parentName, bucket) {
  for (const item of await listChildren(token, folderId)) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      await walkAndCollect(token, item.id, `${parentName}/${item.name}`, bucket);
      continue;
    }
    if (item.name === 'manifest.json') continue;
    bucket.push({ ...item, sourcePath: `${parentName}/${item.name}` });
  }
}

const token = await accessToken();
const templatesRoot = process.env.KYC_DRIVE_TEMPLATES_FOLDER_ID || BETTY.driveTemplatesFolderId;
console.log(`Templates root: ${templatesRoot}`);
console.log(DRY_RUN ? 'Mode: dry-run' : 'Mode: live');

const packageIds = {};
for (const name of PACKAGE_NAMES) {
  packageIds[name] = await ensureFolder(token, templatesRoot, name);
  console.log(`${name}: ${packageIds[name]}`);
}

const archiveId = await ensureFolder(token, templatesRoot, '_archive');

for (const copy of PRIME_COPIES) {
  console.log(`copy prime: ${copy.name}`);
  await copyFile(token, copy.fileId, copy.name, packageIds[copy.target]);
}

const legacyFolders = (await listChildren(token, templatesRoot)).filter(
  (item) => item.mimeType === 'application/vnd.google-apps.folder' && !PACKAGE_NAMES.includes(item.name) && item.name !== '_archive',
);

const collected = [];
for (const folder of legacyFolders) {
  await walkAndCollect(token, folder.id, folder.name, collected);
}

for (const file of collected) {
  const target = classifyByName(file.name);
  const targetId = packageIds[target];
  const parents = await driveFetch(token, `/files/${file.id}?fields=parents`);
  const fromParent = parents.parents?.[0];
  if (fromParent === targetId) continue;
  console.log(`move ${file.name} (${file.sourcePath}) -> ${target}`);
  await moveFile(token, file.id, fromParent, targetId);
}

for (const folder of legacyFolders) {
  const remaining = await listChildren(token, folder.id);
  if (remaining.length) {
    console.log(`legacy folder not empty, skip archive: ${folder.name} (${remaining.length} items)`);
    continue;
  }
  console.log(`archive empty legacy folder: ${folder.name}`);
  await moveFile(token, folder.id, templatesRoot, archiveId);
}

console.log(DRY_RUN ? '\nDry run complete.' : '\nTemplate reorganization complete.');
