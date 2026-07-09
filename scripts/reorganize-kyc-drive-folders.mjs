/**
 * One-time migration: move flat folders under KYC文件 into:
 *   KYC文件/客户案件   (case folders)
 *   KYC文件/标准模板   (template packs)
 *
 * Usage:
 *   node scripts/reorganize-kyc-drive-folders.mjs
 *   node scripts/reorganize-kyc-drive-folders.mjs --dry-run
 *
 * OAuth: Betty's GMAIL_* env vars, or gcloud secrets on project kyc-agent-staging-20260610.
 * Default root: config/betty-drive.defaults.json when BETTY_DRIVE=1
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const ROOT_NAME = 'KYC文件';
const CLIENTS_FOLDER = '客户案件';
const TEMPLATES_FOLDER = '标准模板';
const CASE_FOLDER_PATTERN = /\s-\s[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'kyc-agent-staging-20260610';
const BETTY_DEFAULTS = JSON.parse(
  readFileSync(new URL('../config/betty-drive.defaults.json', import.meta.url), 'utf8'),
);

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
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Drive ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

function escapeQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listFolders(token, parentId) {
  const query = encodeURIComponent(
    `'${escapeQuery(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const body = await driveFetch(token, `/files?q=${query}&fields=files(id,name)&pageSize=200&spaces=drive`);
  return body.files || [];
}

async function findChild(token, parentId, name) {
  const query = encodeURIComponent(
    `'${escapeQuery(parentId)}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escapeQuery(name)}' and trashed=false`,
  );
  const body = await driveFetch(token, `/files?q=${query}&fields=files(id,name)&pageSize=1&spaces=drive`);
  return body.files?.[0]?.id || '';
}

async function ensureFolder(token, parentId, name) {
  const existing = await findChild(token, parentId, name);
  if (existing) return existing;
  if (DRY_RUN) {
    console.log(`[dry-run] would create folder ${name} under ${parentId}`);
    return `dry-run-${name}`;
  }
  const created = await driveFetch(token, '/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  return created.id;
}

async function moveFolder(token, folderId, fromParentId, toParentId) {
  if (DRY_RUN) {
    console.log(`[dry-run] would move ${folderId} from ${fromParentId} -> ${toParentId}`);
    return;
  }
  await driveFetch(
    token,
    `/files/${folderId}?addParents=${encodeURIComponent(toParentId)}&removeParents=${encodeURIComponent(fromParentId)}&fields=id,parents`,
    { method: 'PATCH' },
  );
}

function isTemplateFolder(name) {
  const normalized = name.toLowerCase();
  if (name === CLIENTS_FOLDER || name === TEMPLATES_FOLDER) return false;
  if (CASE_FOLDER_PATTERN.test(name)) return false;
  return (
    normalized.includes('standard')
    || normalized.includes('template')
    || name.includes('标准')
    || name.includes('標準')
    || normalized.includes('generic')
    || normalized.includes('canonical')
    || normalized.includes('region pack')
    || normalized.includes('ns kyc')
    || name.includes('NS KYC')
  );
}

function isCaseFolder(name) {
  return CASE_FOLDER_PATTERN.test(name);
}

async function findKycRoot(token) {
  if (process.env.KYC_DRIVE_ROOT_FOLDER_ID) {
    return process.env.KYC_DRIVE_ROOT_FOLDER_ID;
  }
  if (process.env.BETTY_DRIVE === '1' || process.env.BETTY_DRIVE === 'true') {
    return BETTY_DEFAULTS.driveRootFolderId;
  }

  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${escapeQuery(ROOT_NAME)}' and trashed=false`,
  );
  const body = await driveFetch(token, `/files?q=${query}&fields=files(id,name)&pageSize=20&spaces=drive`);
  const candidates = body.files || [];
  if (!candidates.length) throw new Error(`Could not find folder named ${ROOT_NAME}`);

  let best = candidates[0];
  let bestCount = -1;
  for (const folder of candidates) {
    const children = await listFolders(token, folder.id);
    if (children.length > bestCount) {
      best = folder;
      bestCount = children.length;
    }
  }
  return best.id;
}

async function aboutUser(token) {
  const body = await driveFetch(token, '/about?fields=user(displayName,emailAddress)');
  return body.user;
}

const token = await accessToken();
const user = await aboutUser(token);
console.log(`Drive account: ${user.emailAddress} (${user.displayName})`);
console.log(DRY_RUN ? 'Mode: dry-run' : 'Mode: live move');

const rootId = await findKycRoot(token);
console.log(`${ROOT_NAME} root: ${rootId}`);

const clientsId = await ensureFolder(token, rootId, CLIENTS_FOLDER);
const templatesId = await ensureFolder(token, rootId, TEMPLATES_FOLDER);
console.log(`${CLIENTS_FOLDER}: ${clientsId}`);
console.log(`${TEMPLATES_FOLDER}: ${templatesId}`);

const rootFolders = await listFolders(token, rootId);
const moves = [];

for (const folder of rootFolders) {
  if (folder.name === CLIENTS_FOLDER || folder.name === TEMPLATES_FOLDER) continue;

  let targetParent = '';
  let kind = '';
  if (isCaseFolder(folder.name)) {
    targetParent = clientsId;
    kind = 'case';
  } else if (isTemplateFolder(folder.name)) {
    targetParent = templatesId;
    kind = 'template';
  } else {
    console.log(`skip (unknown): ${folder.name}`);
    continue;
  }

  moves.push({ ...folder, targetParent, kind });
}

console.log(`\nPlanned moves: ${moves.length}`);
for (const move of moves) {
  console.log(`  [${move.kind}] ${move.name} -> ${move.kind === 'case' ? CLIENTS_FOLDER : TEMPLATES_FOLDER}`);
  await moveFolder(token, move.id, rootId, move.targetParent);
}

console.log(DRY_RUN ? '\nDry run complete. Re-run without --dry-run to apply.' : '\nDone.');
