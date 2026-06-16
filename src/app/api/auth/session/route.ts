import { getAdminAuth, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/admin';
import { roleForEmail } from '@/lib/auth/roles';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { idToken } = await request.json();
  const decoded = await getAdminAuth().verifyIdToken(idToken, true);
  if (!decoded.email || !roleForEmail(decoded.email)) {
    return NextResponse.json({ error: 'This account is not authorized.' }, { status: 403 });
  }
  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}

