import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '@/lib/auth/admin';
import { createCustomSessionToken, customAuthEnabled } from '@/lib/auth/custom-session';
import { verifyPasswordLogin } from '@/lib/auth/password-auth';
import { roleForEmail } from '@/lib/auth/roles';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (!customAuthEnabled()) {
    return NextResponse.json({ error: 'Password login is not configured.' }, { status: 503 });
  }

  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) {
    return NextResponse.json({ error: '请输入邮箱和密码。' }, { status: 400 });
  }
  if (!roleForEmail(email)) {
    return NextResponse.json({ error: '该邮箱未授权。' }, { status: 403 });
  }
  if (!verifyPasswordLogin(email, password)) {
    return NextResponse.json({ error: '邮箱或密码不正确。' }, { status: 401 });
  }

  const token = createCustomSessionToken({ uid: email, email, role: roleForEmail(email)! });
  if (!token) {
    return NextResponse.json({ error: 'Session configuration error.' }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, email });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });
  return response;
}
