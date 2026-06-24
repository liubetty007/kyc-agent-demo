#!/usr/bin/env node
/**
 * Create or reset Firebase Auth users for authorized login emails.
 * Usage: GOOGLE_CLOUD_PROJECT=aiasm-497707 node scripts/provision-auth-users.mjs
 */
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const DEFAULT_PASSWORD = process.env.KYC_DEFAULT_PASSWORD || '1234';

const USERS = (process.env.KYC_AUTH_USERS || 'alenw0620@gmail.com,liubetty007@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (!PROJECT_ID) {
  console.error('GOOGLE_CLOUD_PROJECT is required.');
  process.exit(1);
}

const app = getApps()[0] || initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const auth = getAuth(app);

for (const email of USERS) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { password: DEFAULT_PASSWORD, emailVerified: true });
    console.log(`updated\t${email}`);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'auth/user-not-found') throw error;
    await auth.createUser({ email, password: DEFAULT_PASSWORD, emailVerified: true });
    console.log(`created\t${email}`);
  }
}

console.log(`\nDone. Password for listed users: ${DEFAULT_PASSWORD}`);
