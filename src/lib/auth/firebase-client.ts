import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

type PublicAuthConfig = {
  apiKey: string;
  projectId: string;
};

export async function browserAuth() {
  const response = await fetch('/api/auth/config', { cache: 'no-store' });
  if (!response.ok) throw new Error('Authentication is not configured.');
  const firebaseConfig = await response.json() as PublicAuthConfig;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getAuth(app);
}
