import { Buffer } from 'buffer';

export type ConvertedDocumentImage = {
  mimeType: string;
  base64: string;
  dataUrl: string;
};

export type ConvertedDocument = {
  kind: 'image' | 'article';
  filename: string;
  mimeType?: string;
  extractionMethod: 'image' | 'pdf' | 'docx' | 'xlsx' | 'text' | 'html' | 'binary';
  text: string;
  images: ConvertedDocumentImage[];
  warnings: string[];
};

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extension(filename: string): string {
  const match = filename.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || '';
}

function imageMimeType(filename: string, mimeType?: string): string | undefined {
  if (mimeType?.startsWith('image/')) return mimeType;
  return IMAGE_MIME_BY_EXTENSION[extension(filename)];
}

function decodeText(content: Buffer): string {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(content);
  return normalizeText(decoded.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' '));
}

function stripHtml(text: string): string {
  return normalizeText(
    text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

function xmlToText(xml: string): string {
  return normalizeText(
    xml
      .replace(/<\/w:p>|<\/a:t>|<\/t>|<\/v>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

async function extractPdfText(content: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: content });
  try {
    const parsed = await parser.getText();
    return normalizeText(parsed.text || '');
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(content: Buffer): Promise<string> {
  const JSZipModule = await import('jszip');
  const JSZip = JSZipModule.default;
  const archive = await JSZip.loadAsync(content);
  const xmlFile = archive.file('word/document.xml');
  if (!xmlFile) return '';
  return xmlToText(await xmlFile.async('string'));
}

async function extractXlsxText(content: Buffer): Promise<string> {
  const JSZipModule = await import('jszip');
  const JSZip = JSZipModule.default;
  const archive = await JSZip.loadAsync(content);
  const sharedStringsXml = await archive.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedStringsXml
    ? [...sharedStringsXml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => xmlToText(match[0]))
    : [];

  const rows: string[] = [];
  const sheetFiles = Object.keys(archive.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort()
    .slice(0, 8);

  for (const name of sheetFiles) {
    const xml = await archive.file(name)?.async('string');
    if (!xml) continue;
    const cells = [...xml.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)]
      .map((match) => {
        const attrs = match[1] || '';
        const body = match[2] || '';
        const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || '';
        if (/\bt="s"/.test(attrs)) return sharedStrings[Number(value)] || value;
        return value;
      })
      .filter(Boolean);
    if (cells.length) rows.push(`${name}: ${cells.join(' | ')}`);
  }

  return normalizeText(rows.join('\n'));
}

export async function convertDocumentForLlm(input: {
  filename: string;
  mimeType?: string;
  content: Buffer;
}): Promise<ConvertedDocument> {
  const filename = input.filename;
  const mimeType = input.mimeType;
  const ext = extension(filename);
  const warnings: string[] = [];
  const imageMime = imageMimeType(filename, mimeType);

  if (imageMime) {
    const base64 = input.content.toString('base64');
    return {
      kind: 'image',
      filename,
      mimeType: imageMime,
      extractionMethod: 'image',
      text: '',
      images: [{ mimeType: imageMime, base64, dataUrl: `data:${imageMime};base64,${base64}` }],
      warnings,
    };
  }

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    try {
      const text = await extractPdfText(input.content);
      if (!text) warnings.push('No embedded text was found in this PDF. Scanned PDFs need OCR or page rendering before vision analysis.');
      return { kind: 'article', filename, mimeType, extractionMethod: 'pdf', text, images: [], warnings };
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'PDF text extraction failed.');
      return { kind: 'article', filename, mimeType, extractionMethod: 'binary', text: '', images: [], warnings };
    }
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === '.docx'
  ) {
    try {
      return { kind: 'article', filename, mimeType, extractionMethod: 'docx', text: await extractDocxText(input.content), images: [], warnings };
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'DOCX text extraction failed.');
      return { kind: 'article', filename, mimeType, extractionMethod: 'binary', text: '', images: [], warnings };
    }
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || ext === '.xlsx'
  ) {
    try {
      return { kind: 'article', filename, mimeType, extractionMethod: 'xlsx', text: await extractXlsxText(input.content), images: [], warnings };
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'XLSX text extraction failed.');
      return { kind: 'article', filename, mimeType, extractionMethod: 'binary', text: '', images: [], warnings };
    }
  }

  const decoded = decodeText(input.content);
  if (mimeType === 'text/html' || ext === '.html' || ext === '.htm') {
    return { kind: 'article', filename, mimeType, extractionMethod: 'html', text: stripHtml(decoded), images: [], warnings };
  }

  const textExtensions = new Set(['.txt', '.csv', '.json', '.md', '.xml']);
  if (mimeType?.startsWith('text/') || textExtensions.has(ext)) {
    return { kind: 'article', filename, mimeType, extractionMethod: 'text', text: decoded, images: [], warnings };
  }

  warnings.push('Unsupported binary document type. Convert to PDF, DOCX, TXT, CSV, XLSX, PNG, or JPG for automated analysis.');
  return { kind: 'article', filename, mimeType, extractionMethod: decoded ? 'text' : 'binary', text: decoded, images: [], warnings };
}
