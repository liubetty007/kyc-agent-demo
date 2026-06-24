import { createHmac, timingSafeEqual } from 'crypto';
import { roleForEmail, type AppUser } from './roles';

const SESSION_MAX_AGE_SEC = 8 * 60 * 60;

function sessionSecret(): string | null {
  return process.env.KYC_SESSION_SECRET || null;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function createCustomSessionToken(user: AppUser): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = {
    uid: user.uid,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyCustomSessionToken(value: string): AppUser | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;
  const expected = sign(body, secret);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      uid?: string;
      email?: string;
      role?: string;
      exp?: number;
    };
    if (!payload.email || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    const email = payload.email.toLowerCase();
    const role = roleForEmail(email);
    if (!role) return null;
    return { uid: payload.uid || email, email, role };
  } catch {
    return null;
  }
}

export function customAuthEnabled(): boolean {
  return Boolean(sessionSecret() && process.env.KYC_AUTH_PASSWORDS);
}
