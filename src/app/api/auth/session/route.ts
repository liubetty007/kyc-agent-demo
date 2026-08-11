import { getAdminAuth, SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/admin';
import { roleForEmail } from '@/lib/auth/roles';
import { rejectCrossSiteRequest } from '@/lib/auth/request-security';
import { NextResponse } from 'next/server';

const MAX_AUTH_AGE_SECONDS = 5 * 60;

export async function POST(request: Request) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) return crossSiteResponse;
  try {
    const body = await request.json() as { idToken?: unknown };
    if (typeof body.idToken !== 'string' || !body.idToken || body.idToken.length > 8192) {
      return NextResponse.json({ error: 'Invalid authentication token.' }, { status: 400 });
    }
    const decoded = await getAdminAuth().verifyIdToken(body.idToken, true);
    if (!decoded.email) {
      return NextResponse.json({ error: 'Account email is unavailable.' }, { status: 403 });
    }
    if (decoded.email_verified !== true) {
      return NextResponse.json({ error: 'Account email is not verified.' }, { status: 403 });
    }
    if (!roleForEmail(decoded.email)) {
      return NextResponse.json({ error: 'Account is not allowlisted.' }, { status: 403 });
    }
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof decoded.auth_time !== 'number'
      || decoded.auth_time > now + 60
      || now - decoded.auth_time > MAX_AUTH_AGE_SECONDS
    ) {
      return NextResponse.json({ error: 'Recent authentication is required.' }, { status: 401 });
    }
    const sessionCookie = await getAdminAuth().createSessionCookie(body.idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
      priority: 'high',
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  const crossSiteResponse = rejectCrossSiteRequest(request);
  if (crossSiteResponse) return crossSiteResponse;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    priority: 'high',
  });
  return response;
}
