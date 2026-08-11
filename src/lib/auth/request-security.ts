import { NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HOST_PATTERN = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

function externalRequestOrigin(request: Request): string | null {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim();
  if (!host || !HOST_PATTERN.test(host)) return null;

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const protocol = forwardedProto || new URL(request.url).protocol.replace(':', '');
  if (protocol !== 'https' && protocol !== 'http') return null;
  if (process.env.NODE_ENV === 'production' && protocol !== 'https') return null;

  return new URL(`${protocol}://${host}`).origin;
}

/**
 * Browser requests that mutate state must come from this application. Requests
 * without browser origin metadata remain supported for trusted CLI smoke tests.
 */
export function rejectCrossSiteRequest(request: Request): NextResponse | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Cross-site request rejected.' }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  if (!origin) return null;

  try {
    const expectedOrigin = externalRequestOrigin(request);
    if (!expectedOrigin || new URL(origin).origin !== expectedOrigin) {
      return NextResponse.json({ error: 'Cross-site request rejected.' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  return null;
}
