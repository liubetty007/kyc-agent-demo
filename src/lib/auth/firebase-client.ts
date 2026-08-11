import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence, type Auth } from 'firebase/auth';

type PublicAuthConfig = {
  apiKey: string;
  projectId: string;
};

let authPromise: Promise<Auth> | null = null;

export async function browserAuth(): Promise<Auth> {
  authPromise ||= (async () => {
    const response = await fetch('/api/auth/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Authentication is not configured.');
    const firebaseConfig = await response.json() as PublicAuthConfig;
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    // Keep the Firebase credential in memory only. It is exchanged immediately
    // for an HttpOnly server session and then cleared with signOut().
    await setPersistence(auth, inMemoryPersistence);
    return auth;
  })();
  try {
    return await authPromise;
  } catch (error) {
    authPromise = null;
    throw error;
  }
}
