import { generateChecklist } from './checklist';
import { getLlmJson, hasLlmConfigured, activeLlmProvider } from './claude';
import type { KYCCase } from './types';

type ExtractedDocumentText = {
  text: string;
  method: 'pdf' | 'docx' | 'text' | 'binary';
};

export type DocumentAnalysis = {
  filename: string;
  mimeType?: string;
  storageObject?: string;
  extractionMethod: string;
  extractedTextPreview: string;
  summary: string;
  suggestedRequirementId?: string;
  suggestedRequirementName?: string;
  confidence: number;
  keyPoints: string[];
  riskFlags: string[];
  requiresHumanReview: boolean;
};

type ChecklistOption = {
  id: string;
  name: string;
  category: string;
  required: boolean;
};

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function previewText(text: string, maxChars = 2200): string {
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}…`;
}

async function extractDocumentText(content: Buffer, filename: string, mimeType?: string): Promise<ExtractedDocumentText> {
  const lower = filename.toLowerCase();
  const isPdf = mimeType === 'application/pdf' || lower.endsWith('.pdf');
  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx');

  if (isPdf) {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: content });
      try {
        const parsed = await parser.getText();
        return { text: parsed.text || '', method: 'pdf' };
      } finally {
        await parser.destroy();
      }
    } catch {
      return { text: '', method: 'binary' };
    }
  }

  if (isDocx) {
    try {
      const JSZipModule = await import('jszip');
      const JSZip = JSZipModule.default;
      const archive = await JSZip.loadAsync(content);
      const xmlFile = archive.file('word/document.xml');
      if (!xmlFile) return { text: '', method: 'docx' };
      const xml = await xmlFile.async('string');
      const text = xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return { text: normalizeText(text), method: 'docx' };
    } catch {
      return { text: '', method: 'binary' };
    }
  }

  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(content);
  const printable = decoded.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' ');
  return { text: normalizeText(printable), method: printable.trim() ? 'text' : 'binary' };
}

function checklistOptions(caseData: KYCCase): ChecklistOption[] {
  return (caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData)).map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    required: item.required,
  }));
}

function fallbackAnalysis(
  caseData: KYCCase,
  filename: string,
  extractedText: string,
  extractionMethod: string,
): DocumentAnalysis {
  const haystack = `${filename}\n${extractedText}`.toLowerCase();
  const options = checklistOptions(caseData);
  const match = options.find((item) => {
    const tokens = [item.id, item.name, item.category]
      .join(' ')
      .toLowerCase()
      .replace(/[_/()-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3);
    return tokens.some((token) => haystack.includes(token));
  });

  const keyPoints = extractedText
    ? [
        extractedText.slice(0, 140),
        extractionMethod === 'binary' ? 'Binary file or unsupported format.' : `Text extracted via ${extractionMethod}.`,
      ]
    : ['No reliable text extracted from the file.'];

  return {
    filename,
    extractionMethod,
    extractedTextPreview: previewText(extractedText),
    summary: extractedText
      ? `File content looks closest to ${match?.name || 'an unmatched checklist item'}.`
      : 'Unable to extract meaningful text from the file. Please review manually.',
    suggestedRequirementId: match?.id,
    suggestedRequirementName: match?.name,
    confidence: extractedText ? (match ? 0.62 : 0.28) : 0.18,
    keyPoints,
    riskFlags: extractedText ? ['manual_review_recommended'] : ['no_extractable_text'],
    requiresHumanReview: true,
  };
}

function normalizeCandidate(candidate: Partial<DocumentAnalysis>, fallback: DocumentAnalysis): DocumentAnalysis {
  const confidence = typeof candidate.confidence === 'number' ? Math.max(0, Math.min(1, candidate.confidence)) : fallback.confidence;
  const suggestedRequirementId = typeof candidate.suggestedRequirementId === 'string' && candidate.suggestedRequirementId.trim()
    ? candidate.suggestedRequirementId.trim()
    : fallback.suggestedRequirementId;
  const requiresHumanReview =
    typeof candidate.requiresHumanReview === 'boolean'
      ? candidate.requiresHumanReview
      : confidence < 0.85 || Boolean(candidate.riskFlags?.length);

  return {
    filename: candidate.filename || fallback.filename,
    mimeType: candidate.mimeType || fallback.mimeType,
    storageObject: candidate.storageObject || fallback.storageObject,
    extractionMethod: candidate.extractionMethod || fallback.extractionMethod,
    extractedTextPreview: candidate.extractedTextPreview || fallback.extractedTextPreview,
    summary: candidate.summary || fallback.summary,
    suggestedRequirementId,
    suggestedRequirementName: candidate.suggestedRequirementName || fallback.suggestedRequirementName,
    confidence,
    keyPoints: Array.isArray(candidate.keyPoints) ? candidate.keyPoints.slice(0, 8) : fallback.keyPoints,
    riskFlags: Array.isArray(candidate.riskFlags) ? candidate.riskFlags.slice(0, 8) : fallback.riskFlags,
    requiresHumanReview,
  };
}

export async function analyzeCaseDocument(input: {
  caseData: KYCCase;
  filename: string;
  content: Buffer;
  mimeType?: string;
  storageObject?: string;
}): Promise<DocumentAnalysis> {
  const extracted = await extractDocumentText(input.content, input.filename, input.mimeType);
  const fallback = fallbackAnalysis(input.caseData, input.filename, extracted.text, extracted.method);

  if (!hasLlmConfigured() || !extracted.text.trim()) {
    return {
      ...fallback,
      mimeType: input.mimeType,
      storageObject: input.storageObject,
    };
  }

  const options = checklistOptions(input.caseData);
  const prompt = `You are a KYC document analyst. Analyze the uploaded file and decide whether it matches one checklist item.

Return JSON only. Do not include markdown.

Case:
${JSON.stringify({
  id: input.caseData.id,
  companyName: input.caseData.companyName,
  contactEmail: input.caseData.contactEmail,
  jurisdiction: input.caseData.jurisdiction,
  businessType: input.caseData.businessType,
  status: input.caseData.status,
})}

Checklist options:
${JSON.stringify(options)}

File:
${JSON.stringify({
  filename: input.filename,
  mimeType: input.mimeType,
  textPreview: previewText(extracted.text, 6000),
})}

Required JSON shape:
{
  "summary": "one concise paragraph",
  "suggestedRequirementId": "checklist id or null",
  "suggestedRequirementName": "matching checklist name or null",
  "confidence": 0.0,
  "keyPoints": ["short bullet-like strings"],
  "riskFlags": ["short machine-readable flags"],
  "requiresHumanReview": true
}

Rules:
- Use the file content, not the filename alone.
- Only pick a suggestedRequirementId from the provided checklist options.
- If the evidence is weak or ambiguous, set suggestedRequirementId to null and confidence below 0.5.
- Never approve or reject the customer.
- Always set requiresHumanReview=true unless the match is very strong and unambiguous.`;

  const llm = await getLlmJson<Partial<DocumentAnalysis>>(prompt, fallback);
  return normalizeCandidate(
    {
      ...llm,
      filename: input.filename,
      mimeType: input.mimeType,
      storageObject: input.storageObject,
      extractionMethod: extracted.method,
      extractedTextPreview: previewText(extracted.text),
    },
    {
      ...fallback,
      filename: input.filename,
      mimeType: input.mimeType,
      storageObject: input.storageObject,
      extractionMethod: extracted.method,
      extractedTextPreview: previewText(extracted.text),
    },
  );
}

export function llmProviderLabel(): string {
  const provider = activeLlmProvider();
  if (provider === 'ollama') return 'Ollama';
  if (provider === 'anthropic') return 'Claude';
  return 'fallback rules';
}
