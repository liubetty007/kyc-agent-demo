#!/usr/bin/env node
/**
 * End-to-end smoke test against deployed KYC Agent frontend.
 * Usage: KYC_SMOKE_COOKIE='__Host-kyc_session=...' node scripts/smoke-demo.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'https://kyc-agent-frontend-20130272975.asia-east2.run.app').replace(/\/$/, '');
const SESSION_COOKIE = process.env.KYC_SMOKE_COOKIE || '';

const steps = [];
let cookie = SESSION_COOKIE;

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
    const match = part.match(/((?:__Host-)?kyc_session)=([^;]+)/);
    if (match) cookie = `${match[1]}=${match[2]}`;
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
  console.log(`Smoke demo: ${BASE}\n`);

  let r;
  if (!SESSION_COOKIE) {
    r = await request('/login');
    if (r.response.status !== 200) fail('public login page', `status ${r.response.status}`);
    pass('public login page');
    r = await request('/api/cases', { redirect: 'manual' });
    if (r.response.status !== 401) fail('unauthenticated API boundary', `status ${r.response.status}`);
    pass('unauthenticated API boundary', '401');
    console.log('\nPublic security smoke steps passed. Set KYC_SMOKE_COOKIE for authenticated workflow tests.');
    return;
  }

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
