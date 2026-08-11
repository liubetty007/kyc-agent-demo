import { NextResponse } from 'next/server';

const SECRET_PATTERNS = [
  /(authorization\s*:\s*bearer\s+)[^\s,;]+/gi,
  /((?:access|refresh)[_-]?token|client[_-]?secret|api[_-]?key|password)(\s*[=:]\s*)[^\s,;"']+/gi,
];

function redactedError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'Unknown error');
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, '$1$2[REDACTED]'), raw)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 1000);
}

export function safeErrorResponse(
  context: string,
  error: unknown,
  publicMessage: string,
  status = 500,
): NextResponse {
  const reference = crypto.randomUUID();
  console.error(`[${reference}] ${context}: ${redactedError(error)}`);
  return NextResponse.json({ error: publicMessage, reference }, { status });
}

export function safeUpstreamErrorResponse(context: string, error: unknown, publicMessage: string): NextResponse {
  const raw = error instanceof Error ? error.message : '';
  const parsedStatus = Number(raw.match(/^(\d{3}):/)?.[1] || 0);
  const status = parsedStatus >= 400 && parsedStatus < 500 ? parsedStatus : 502;
  return safeErrorResponse(context, error, publicMessage, status);
}
