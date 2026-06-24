import { execFileSync } from 'node:child_process';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

function secret(name) {
  return execFileSync(
    '/Users/openclawbot/google-cloud-sdk/bin/gcloud',
    ['secrets', 'versions', 'access', 'latest', '--secret', name, '--project', 'kyc-agent-staging-20260610'],
    { encoding: 'utf8' },
  ).trim();
}

async function accessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || secret('gmail-client-id'),
      client_secret: process.env.GMAIL_CLIENT_SECRET || secret('gmail-client-secret'),
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || secret('gmail-refresh-token'),
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw new Error(`OAuth failed: ${response.status}`);
  const body = await response.json();
  if (!body.access_token) throw new Error('OAuth did not return an access token.');
  return body.access_token;
}

const token = await accessToken();

async function driveFetch(path, init = {}) {
  const response = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Drive API failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return response;
}

function escapeQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findFolder(parentId, name) {
  const parent = parentId === 'root' ? "'root' in parents" : `'${escapeQuery(parentId)}' in parents`;
  const query = encodeURIComponent(`${parent} and mimeType='application/vnd.google-apps.folder' and name='${escapeQuery(name)}' and trashed=false`);
  const response = await driveFetch(`/files?q=${query}&fields=files(id,name)&pageSize=10&spaces=drive`);
  const body = await response.json();
  return body.files?.[0]?.id;
}

async function ensureFolder(parentId, name) {
  const existing = await findFolder(parentId, name);
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

async function findFile(parentId, name) {
  const query = encodeURIComponent(`'${escapeQuery(parentId)}' in parents and name='${escapeQuery(name)}' and trashed=false`);
  const response = await driveFetch(`/files?q=${query}&fields=files(id,name,mimeType,size)&pageSize=10&spaces=drive`);
  const body = await response.json();
  return body.files?.[0];
}

async function uploadText(parentId, name, content, contentType = 'text/plain; charset=UTF-8') {
  const existing = await findFile(parentId, name);
  if (existing?.id) return existing;

  const boundary = `boundary_${crypto.randomUUID()}`;
  const data = Buffer.from(content, 'utf8');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, 'utf8'),
    Buffer.from(JSON.stringify({ name, parents: [parentId] }), 'utf8'),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf8'),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Drive upload failed ${response.status}: ${text.slice(0, 500)}`);
  }
  return response.json();
}

const root = await ensureFolder('root', 'KYC文件');
const standardRoot = await ensureFolder(root, 'KYC Standard Documents');
const canonical = await ensureFolder(standardRoot, 'Canonical Templates');
const regionPacks = await ensureFolder(standardRoot, 'Region Packs');

const regions = {
  Generic: [
    ['Mutual_NDA_Template.txt', 'Generic Mutual NDA template placeholder.\nProtected sections: confidentiality obligations, governing law, signature block.\nRequired fields: company legal name, signer name, title, date, signature.'],
    ['Institution_Onboarding_Form.txt', 'Institution onboarding form placeholder.\nRequired fields: legal name, registration number, registered address, business type, source of funds, authorized representative, contact email, signature date, signature.'],
    ['Authorization_Letter_Template.txt', 'Authorization letter template placeholder.\nProtected sections: authority to open account, authorized persons, permitted business scope.\nRequired fields: company name, authorized representative, title, date, signature.'],
  ],
  'Hong Kong': [
    ['HK_NNC1_or_NAR1_Guide.txt', 'Hong Kong company filing placeholder.\nRequired: NNC1 if incorporated within one year, latest NAR1 if older than one year.'],
    ['HK_Non_US_Person_Confirmation.txt', 'Hong Kong Non-US person and non-solicitation confirmation placeholder.\nRequired fields: company name, confirmation statements, signer, title, date, signature.'],
  ],
  'United States': [
    ['US_W9_Tax_Form_Request.txt', 'United States tax form request placeholder.\nRequired: W-9 or applicable tax documentation based on entity profile.'],
    ['US_State_Registration_Checklist.txt', 'US state registration checklist placeholder.\nRequired fields: state of formation, entity registration evidence, registered agent, good standing if applicable.'],
  ],
  Singapore: [
    ['SG_ACRA_Profile_Request.txt', 'Singapore ACRA business profile request placeholder.\nRequired: latest ACRA profile and ownership/directorship details.'],
    ['SG_Board_Authorization_Guide.txt', 'Singapore board authorization guide placeholder.\nRequired fields: company name, board approval wording, authorized signatories, date, signature.'],
  ],
};

const canonicalFiles = [];
for (const [region, files] of Object.entries(regions)) {
  const folder = region === 'Generic' ? canonical : await ensureFolder(regionPacks, region);
  for (const [name, content] of files) {
    const file = await uploadText(folder, name, content);
    canonicalFiles.push({ region, name, file_id: file.id });
  }
}

const genericFolder = await ensureFolder(regionPacks, 'Generic');
for (const [name, content] of regions.Generic) {
  await uploadText(genericFolder, name, content);
}

const manifest = {
  version: 1,
  generated_at: new Date().toISOString(),
  note: 'Demo manifest for KYC opening email template routing. Replace placeholder file ids with approved production templates before real use.',
  rows: canonicalFiles.map((file) => ({
    region: file.region,
    business_type: 'all',
    doc_type: file.name.replace(/\.txt$/, ''),
    template_file_id: file.file_id,
    required: true,
    attach_in_opening_email: true,
  })),
};
const manifestFile = await uploadText(standardRoot, 'manifest.json', `${JSON.stringify(manifest, null, 2)}\n`, 'application/json; charset=UTF-8');

console.log(JSON.stringify({
  root,
  standardRoot,
  canonical,
  regionPacks,
  manifest: manifestFile.id,
  regions: Object.keys(regions),
}, null, 2));
