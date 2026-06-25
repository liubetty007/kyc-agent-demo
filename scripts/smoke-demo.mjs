#!/usr/bin/env node
/**
 * End-to-end smoke test against deployed KYC Agent frontend.
 * Usage: node scripts/smoke-demo.mjs [baseUrl] [loginEmail]
 */
const BASE = (process.argv[2] || 'https://kyc-agent-frontend-767566934621.asia-east2.run.app').replace(/\/$/, '');
const LOGIN_EMAIL = process.argv[3] || 'kexin.li@antalpha.com';
const PASSWORD = '1234';

const steps = [];
let cookie = '';

function fail(step, detail) {
  steps.push({ step, ok: false, detail });
  console.error(`FAIL: ${step} — ${detail}`);
  process.exit(1);
}

function pass(step, detail = '') {
  steps.push({ step, ok: true, detail });
  console.log(`OK: ${step}${detail ? ` — ${detail}` : ''}`);
}

async function request(path, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const setCookie = response.headers.getSetCookie?.() || [];
  for (const part of setCookie) {
    const match = part.match(/kyc_session=([^;]+)/);
    if (match) cookie = `kyc_session=${match[1]}`;
  }
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { response, body };
}

async function main() {
  console.log(`Smoke demo: ${BASE} as ${LOGIN_EMAIL}\n`);

  let r = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: PASSWORD }),
  });
  if (!r.response.ok) fail('login', r.body.error || r.response.status);
  pass('login', LOGIN_EMAIL);

  r = await request('/', { redirect: 'manual' });
  if (r.response.status !== 200 && r.response.status !== 307) fail('home', `status ${r.response.status}`);
  pass('home', `status ${r.response.status}`);

  const casePayload = {
    companyName: `Smoke Demo ${new Date().toISOString().slice(0, 16)}`,
    contactEmail: 'demo-client@example.com',
    jurisdiction: 'Hong Kong',
    businessType: 'btc_loan',
    sourceOfFunds: 'Trading revenue',
    language: 'en',
    needsNsBusiness: false,
  };
  r = await request('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(casePayload),
  });
  if (!r.response.ok) fail('create case', r.body.error || JSON.stringify(r.body));
  const caseId = r.body.id;
  pass('create case', caseId);

  r = await request(`/api/cases/${caseId}/opening-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r.response.ok || !r.body.openingEmailDraft) fail('generate opening email', r.body.error || 'no draft');
  pass('generate opening email');

  r = await request(`/api/cases/${caseId}/opening-email/attachments`);
  if (!r.response.ok) fail('load attachments', r.body.error || r.response.status);
  const pkgCount = (r.body.packages || []).length;
  const attCount = (r.body.standard || r.body.packages?.flatMap((p) => p.attachments) || []).length;
  if (!attCount) fail('load attachments', '0 standard attachments');
  pass('load attachments', `${pkgCount} packages, ${attCount} files`);

  const attachments = [];
  for (const pkg of r.body.packages || []) {
    if (pkg.defaultSelected) attachments.push(...pkg.attachments);
  }
  r = await request(`/api/cases/${caseId}/opening-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send_demo' }),
  });
  if (!r.response.ok) fail('demo send opening', r.body.error || r.response.status);
  pass('demo send opening');

  r = await request(`/api/cases/${caseId}/client-email-draft`, { method: 'POST' });
  if (!r.response.ok) fail('generate follow-up draft', r.body.error || r.response.status);
  pass('generate follow-up draft');

  r = await request(`/api/cases/${caseId}/checklist`, { method: 'POST' });
  if (!r.response.ok) fail('regenerate checklist', r.body.error || r.response.status);
  pass('regenerate checklist', `${(r.body.checklist || []).length} items`);

  r = await request(`/api/cases/${caseId}/review`, { method: 'POST' });
  if (!r.response.ok) fail('agent review', r.body.error || r.response.status);
  pass('agent review');

  console.log('\nAll smoke steps passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
