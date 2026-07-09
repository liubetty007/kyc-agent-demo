/**
 * Restructure each template file into: Package / document_slug / EN|ZH / files
 * Run with backend OAuth token available (see reorganize-betty-template-folders.mjs).
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRY_RUN = process.argv.includes('--dry-run');
const BETTY = JSON.parse(readFileSync(new URL('../config/betty-drive.defaults.json', import.meta.url), 'utf8'));
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'kyc-agent-staging-20260610';
const PACKAGES = BETTY.openingEmailPackages || [];

function secret(name) {
  try {
    return execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${PROJECT_ID}`], { encoding: 'utf8' }).trim();
  } catch {
    return process.env[name] || '';
  }
}

async function token() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: secret('GMAIL_CLIENT_ID') || secret('gmail-client-id'),
      client_secret: secret('GMAIL_CLIENT_SECRET') || secret('gmail-client-secret'),
      refresh_token: secret('GMAIL_REFRESH_TOKEN') || secret('gmail-refresh-token'),
      grant_type: 'refresh_token',
    }),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error('OAuth failed');
  return body.access_token;
}

async function drive(accessToken, path, init = {}) {
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Drive ${response.status}: ${(await response.text()).slice(0, 300)}`);
  if (response.status === 204) return null;
  return response.json();
}

function esc(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listChildren(accessToken, parentId) {
  const q = encodeURIComponent(`'${esc(parentId)}' in parents and trashed=false`);
  const body = await drive(accessToken, `/files?q=${q}&fields=files(id,name,mimeType,parents)&pageSize=200&orderBy=folder,name_natural&spaces=drive`);
  return body.files || [];
}

async function ensureFolder(accessToken, parentId, name) {
  const q = encodeURIComponent(`'${esc(parentId)}' in parents and name='${esc(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const body = await drive(accessToken, `/files?q=${q}&fields=files(id)&pageSize=1&spaces=drive`);
  if (body.files?.[0]?.id) return body.files[0].id;
  if (DRY_RUN) return `dry-${name}`;
  const created = await drive(accessToken, '/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  return created.id;
}

async function moveFile(accessToken, fileId, fromParent, toParent) {
  if (DRY_RUN) {
    console.log(`[dry-run] move ${fileId} -> ${toParent}`);
    return;
  }
  await drive(accessToken, `/files/${fileId}?addParents=${encodeURIComponent(toParent)}&removeParents=${encodeURIComponent(fromParent)}`, { method: 'PATCH' });
}

function detectTemplateLocale(name) {
  if (/[\u4e00-\u9fff]/.test(name)) return 'ZH';
  if (/授權|機構|董事|保密|開戶|开户|資金|资金/.test(name)) return 'ZH';
  return 'EN';
}

function classifyTemplateDocumentSlug(filename, packageName) {
  const normalized = filename.toLowerCase().replace(/[_-]+/g, ' ');
  const packageNorm = packageName.toLowerCase();
  if (packageNorm.includes('ns documents') || /\bns[_\s-]?(br|nda)\b/.test(normalized) || normalized.includes('northstar')) {
    if (normalized.includes('nda') || filename.includes('保密')) return 'mutual_nda_ns';
    if (normalized.includes('board') || normalized.includes('br') || filename.includes('董事')) return 'board_resolution_ns';
  }
  if (normalized.includes('onboarding') || filename.includes('開戶') || filename.includes('开户')) return 'institution_onboarding_form';
  if (normalized.includes('board resolution') || filename.includes('董事決議') || filename.includes('董事决议')) return 'board_resolution';
  if (normalized.includes('nda') || normalized.includes('mutual') || filename.includes('保密')) return 'mutual_nda';
  if (normalized.includes('source of funds') || filename.includes('資金') || filename.includes('资金')) return 'source_of_funds';
  if (normalized.includes('non-us') || normalized.includes('non us')) return 'non_us_person_hk_confirmation';
  if (normalized.includes('acra')) return 'sg_acra_profile';
  if (normalized.includes('board authorization')) return 'sg_board_authorization_guide';
  if (normalized.includes('authorization') || filename.includes('授權') || filename.includes('授权')) return 'authorization_letter';
  if (normalized.includes('registration checklist')) return 'us_state_registration_checklist';
  if (normalized.includes('w9')) return 'us_w9_request';
  return filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_').slice(0, 60) || 'document';
}

function localesForFile(name) {
  const hasLatin = /[A-Za-z]{3,}/.test(name);
  const hasCjk = /[\u4e00-\u9fff]/.test(name) || /授權|機構|董事|保密|開戶|开户|資金|资金/.test(name);
  if (hasLatin && hasCjk) return ['EN', 'ZH'];
  return [detectTemplateLocale(name)];
}

const accessToken = await token();
const templatesRoot = process.env.KYC_DRIVE_TEMPLATES_FOLDER_ID || BETTY.driveTemplatesFolderId;
console.log(`Templates root: ${templatesRoot}`);

for (const packageName of PACKAGES) {
  const packageId = await ensureFolder(accessToken, templatesRoot, packageName);
  const children = await listChildren(accessToken, packageId);
  const files = children.filter((item) => item.mimeType !== 'application/vnd.google-apps.folder');
  const existingDocFolders = children.filter((item) => item.mimeType === 'application/vnd.google-apps.folder');

  for (const file of files) {
    const slug = classifyTemplateDocumentSlug(file.name, packageName);
    const docFolderId = await ensureFolder(accessToken, packageId, slug);
    for (const locale of localesForFile(file.name)) {
      const localeFolderId = await ensureFolder(accessToken, docFolderId, locale);
      console.log(`place ${file.name} -> ${packageName}/${slug}/${locale}`);
      await moveFile(accessToken, file.id, file.parents[0], localeFolderId);
    }
  }

  for (const docFolder of existingDocFolders) {
    if (['EN', 'ZH', 'en', 'zh', '中文', '英文'].includes(docFolder.name)) continue;
    const docChildren = await listChildren(accessToken, docFolder.id);
    const looseFiles = docChildren.filter((item) => item.mimeType !== 'application/vnd.google-apps.folder');
    const localeFolders = docChildren.filter((item) => item.mimeType === 'application/vnd.google-apps.folder' && ['EN', 'ZH'].includes(item.name.toUpperCase()));
    if (localeFolders.length) continue;

    for (const file of looseFiles) {
      for (const locale of localesForFile(file.name)) {
        const localeFolderId = await ensureFolder(accessToken, docFolder.id, locale);
        console.log(`place ${file.name} -> ${packageName}/${docFolder.name}/${locale}`);
        await moveFile(accessToken, file.id, file.parents[0], localeFolderId);
      }
    }
  }
}

console.log(DRY_RUN ? 'Dry run complete.' : 'Document folder reorganization complete.');
