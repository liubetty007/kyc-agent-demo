import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { customAuthEnabled, verifyCustomSessionToken } from './custom-session';
import { roleForEmail, type AppRole, type AppUser } from './roles';

export const SESSION_COOKIE = 'kyc_session';
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const DEV_USER: AppUser = {
  uid: 'local-dev',
  email: 'liubetty007@gmail.com',
  role: 'admin',
};

export function isDevAuthBypass(): boolean {
  return process.env.KYC_DEV_BYPASS_AUTH === 'true';
}

function adminAuth() {
  const app = getApps()[0] || initializeApp({ credential: applicationDefault() });
  return getAuth(app);
}

export async function verifySessionCookie(value?: string): Promise<AppUser | null> {
  if (!value) return null;
  const customUser = verifyCustomSessionToken(value);
  if (customUser) return customUser;
  if (!process.env.FIREBASE_API_KEY) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(value, true);
    const email = decoded.email?.toLowerCase();
    const role = roleForEmail(email);
    if (!email || !role) return null;
    return { uid: decoded.uid, email, role };
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<AppUser | null> {
  if (isDevAuthBypass()) return DEV_USER;
  const cookieStore = await cookies();
  return verifySessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requirePageUser(roles?: AppRole[]): Promise<AppUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (roles && !roles.includes(user.role)) redirect('/');
  return user;
}

export async function requireApiUser(request: Request, roles?: AppRole[]): Promise<AppUser | NextResponse> {
  if (isDevAuthBypass()) {
    if (roles && !roles.includes(DEV_USER.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return DEV_USER;
  }
  const cookieHeader = request.headers.get('cookie') || '';
  const session = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const user = await verifySessionCookie(session ? decodeURIComponent(session) : undefined);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (roles && !roles.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return user;
}

export function getAdminAuth() {
  return adminAuth();
}
