import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from './lib/auth/session-config';

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com${process.env.NODE_ENV === 'development' ? ' ws:' : ''}`,
    "frame-src 'none'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

function securedNext(request: NextRequest, nonce: string, csp: string): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const csp = contentSecurityPolicy(nonce);
  if (request.nextUrl.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const contentLength = Number(request.headers.get('content-length') || 0);
    const isMultipart = request.headers.get('content-type')?.includes('multipart/form-data');
    const maxBytes = isMultipart ? 50 * 1024 * 1024 : 1024 * 1024;
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      const response = NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
      response.headers.set('Content-Security-Policy', csp);
      return response;
    }
  }
  if (process.env.NODE_ENV !== 'production' && process.env.KYC_DEV_BYPASS_AUTH === 'true') return securedNext(request, nonce, csp);
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/api/auth/')) return securedNext(request, nonce, csp);
  // Edge middleware only performs a coarse cookie-presence redirect. Firebase
  // Admin verifies the cookie and allowlisted role again in every page/API.
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      response.headers.set('Content-Security-Policy', csp);
      return response;
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }
  return securedNext(request, nonce, csp);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
