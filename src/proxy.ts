import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'kyc_session';

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };

