import { Buffer } from 'buffer';

export type PaddleOcrExtraction = {
  text: string;
  pageCount: number;
  warnings: string[];
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TEXT_CHARS = 50_000;

function envEnabled(name: string, fallback = false): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return !['0', 'false', 'no', 'off', 'disabled'].includes(value);
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function paddleOcrServiceUrl(): URL {
  const configured = process.env.PADDLEOCR_BASE_URL?.trim();
  if (!configured) throw new Error('PADDLEOCR_BASE_URL is not configured.');

  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PaddleOCR URL must use HTTP or HTTPS.');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('PaddleOCR URL must use HTTPS in production.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('PaddleOCR URL must not contain credentials, query parameters, or fragments.');
  }

  url.pathname = `${url.pathname.replace(/\/+$/, '')}/ocr`;
  return url;
}

async function cloudRunIdToken(audience: string): Promise<string> {
  const response = await fetch(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!response.ok) throw new Error(`Unable to obtain PaddleOCR service identity token (${response.status}).`);
  const token = (await response.text()).trim();
  if (!token) throw new Error('PaddleOCR service identity token was empty.');
  return token;
}

async function requestHeaders(serviceUrl: URL): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const authMode = (process.env.PADDLEOCR_AUTH_MODE || 'google_id_token').trim().toLowerCase();

  if (authMode === 'none' || authMode === 'public') return headers;
  if (authMode === 'bearer' || authMode === 'api_key') {
    const apiKey = process.env.PADDLEOCR_API_KEY?.trim();
    if (!apiKey) throw new Error('PADDLEOCR_API_KEY is not configured.');
    headers.Authorization = `Bearer ${apiKey}`;
    return headers;
  }
  if (authMode !== 'google_id_token') throw new Error('Unsupported PADDLEOCR_AUTH_MODE.');

  headers.Authorization = `Bearer ${await cloudRunIdToken(serviceUrl.origin)}`;
  return headers;
}

function normalizedLines(lines: string[]): string[] {
  return lines
    .map((line) => line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim())
    .filter(Boolean);
}

function recognizedText(value: unknown, depth = 0): string[] {
  if (depth > 6) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => recognizedText(item, depth + 1));
  }

  const record = asRecord(value);
  if (!record) return [];

  const direct = record.rec_texts ?? record.recTexts;
  if (Array.isArray(direct)) {
    const scores = record.rec_scores ?? record.recScores;
    const minScore = Number(process.env.PADDLEOCR_MIN_SCORE || 0.35);
    return direct.flatMap((text, index) => {
      if (typeof text !== 'string') return [];
      const score = Array.isArray(scores) ? Number(scores[index]) : 1;
      return Number.isFinite(score) && score < minScore ? [] : [text];
    });
  }

  return Object.values(record).flatMap((item) => recognizedText(item, depth + 1));
}

function isPdf(filename: string, mimeType?: string): boolean {
  return mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
}

export function supportsPaddleOcr(filename: string, mimeType?: string): boolean {
  return isPdf(filename, mimeType)
    || Boolean(mimeType?.startsWith('image/'))
    || /\.(?:png|jpe?g|webp|bmp|gif|tiff?)$/i.test(filename);
}

export function hasPaddleOcrConfigured(): boolean {
  return Boolean(process.env.PADDLEOCR_BASE_URL?.trim());
}

export function isPaddleOcrRequired(): boolean {
  return envEnabled('PADDLEOCR_REQUIRED');
}

export async function extractTextWithPaddleOcr(input: {
  filename: string;
  mimeType?: string;
  content: Buffer;
}): Promise<PaddleOcrExtraction> {
  if (!supportsPaddleOcr(input.filename, input.mimeType)) {
    return { text: '', pageCount: 0, warnings: ['PaddleOCR skipped this unsupported file type.'] };
  }

  const maxBytes = Number(process.env.PADDLEOCR_MAX_INPUT_BYTES || 20 * 1024 * 1024);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || input.content.length > maxBytes) {
    throw new Error('File exceeds the PaddleOCR input size limit.');
  }

  const serviceUrl = paddleOcrServiceUrl();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.PADDLEOCR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(serviceUrl, {
      method: 'POST',
      headers: await requestHeaders(serviceUrl),
      body: JSON.stringify({
        file: input.content.toString('base64'),
        fileType: isPdf(input.filename, input.mimeType) ? 0 : 1,
        useDocOrientationClassify: true,
        useDocUnwarping: true,
        useTextlineOrientation: true,
        visualize: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new Error(`PaddleOCR request failed (${response.status}).`);
    const payload = await response.json() as unknown;
    const root = asRecord(payload);
    if (!root || Number(root.errorCode || 0) !== 0) {
      throw new Error('PaddleOCR returned an unsuccessful response.');
    }

    const result = asRecord(root.result);
    const pages = Array.isArray(result?.ocrResults) ? result.ocrResults : [];
    const lines = normalizedLines(pages.flatMap((page) => {
      const record = asRecord(page);
      return recognizedText(record?.prunedResult ?? record);
    }));
    const maxChars = Number(process.env.PADDLEOCR_MAX_TEXT_CHARS || DEFAULT_MAX_TEXT_CHARS);
    const text = lines.join('\n').slice(0, Number.isFinite(maxChars) && maxChars > 0 ? maxChars : DEFAULT_MAX_TEXT_CHARS);
    const warnings = text ? [] : ['PaddleOCR completed but returned no reliable text.'];

    return { text, pageCount: pages.length, warnings };
  } finally {
    clearTimeout(timeout);
  }
}
