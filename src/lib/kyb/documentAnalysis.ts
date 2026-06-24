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
  missingFields: string[];
  issues: string[];
  recommendations: string[];
  followUpPoints: string[];
  severity: 'low' | 'medium' | 'high';
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

const REQUIRED_FIELD_HINTS: Record<string, Array<{ label: string; patterns: RegExp[] }>> = {
  institution_onboarding_form: [
    { label: 'Company legal name', patterns: [/legal entity name\s*[:：]?\s*_{3,}/i, /company name\s*[:：]?\s*_{3,}/i] },
    { label: 'Registration number', patterns: [/registration number\s*[:：]?\s*_{3,}/i] },
    { label: 'Country / place of incorporation', patterns: [/(country|place) of incorporation\s*[:：]?\s*_{3,}/i] },
    { label: 'Source of funds / wealth', patterns: [/source of funds?\s*[:：]?\s*_{3,}/i, /source of wealth\s*[:：]?\s*_{3,}/i] },
    { label: 'Authorized representative / contact person', patterns: [/authorized representative\s*[:：]?\s*_{3,}/i, /contact person\s*[:：]?\s*_{3,}/i] },
    { label: 'Signature', patterns: [/signature\s*[:：]?\s*_{3,}/i] },
    { label: 'Signing date', patterns: [/date\s*[:：]?\s*_{3,}/i] },
  ],
  board_resolution: [
    { label: 'Company name', patterns: [/company name\s*[:：]?\s*_{3,}/i] },
    { label: 'Resolution date', patterns: [/date\s*[:：]?\s*_{3,}/i] },
    { label: 'Authorized signatory name', patterns: [/authorized (person|representative|signator(?:y|ies))\s*[:：]?\s*_{3,}/i] },
    { label: 'Director / officer signature', patterns: [/signature\s*[:：]?\s*_{3,}/i] },
  ],
  declaration_source_of_fund_wealth: [
    { label: 'Source of funds description', patterns: [/source of funds?\s*[:：]?\s*_{3,}/i, /funds? came from\s*[:：]?\s*_{3,}/i] },
    { label: 'Declaration signature', patterns: [/signature\s*[:：]?\s*_{3,}/i] },
    { label: 'Declaration date', patterns: [/date\s*[:：]?\s*_{3,}/i] },
  ],
  mutual_nda: [
    { label: 'Counterparty / company name', patterns: [/company name\s*[:：]?\s*_{3,}/i, /party\s*[:：]?\s*_{3,}/i] },
    { label: 'Signature', patterns: [/signature\s*[:：]?\s*_{3,}/i] },
    { label: 'Date', patterns: [/date\s*[:：]?\s*_{3,}/i] },
  ],
  authorization_letter: [
    { label: 'Authorized person name', patterns: [/authorized (person|representative)\s*[:：]?\s*_{3,}/i] },
    { label: 'Authority scope', patterns: [/authorized to\s*_{3,}/i] },
    { label: 'Signature', patterns: [/signature\s*[:：]?\s*_{3,}/i] },
    { label: 'Date', patterns: [/date\s*[:：]?\s*_{3,}/i] },
  ],
};

function requirementHints(requirementId?: string): Array<{ label: string; patterns: RegExp[] }> {
  if (!requirementId) return [];
  return REQUIRED_FIELD_HINTS[requirementId] || [];
}

function missingFieldLabels(requirementId: string | undefined, text: string): string[] {
  return requirementHints(requirementId)
    .filter((field) => field.patterns.some((pattern) => pattern.test(text)))
    .map((field) => field.label);
}

function sourceOfFundsTokens(caseData: KYCCase): string[] {
  const raw = `${caseData.businessType} ${caseData.sourceOfFunds}`.toLowerCase();
  const tokenMap: Array<[RegExp, string]> = [
    [/\bcrypto|digital asset|virtual asset|btc|bitcoin|usdt|wallet\b/, 'crypto / digital assets'],
    [/\bmining|miner|hashrate|antpool|mining pool\b/, 'mining income'],
    [/\bfinanc|loan|investor|lender|fundraising|shareholder loan\b/, 'financing / loan proceeds'],
    [/\bbusiness income|operating income|revenue|treasury\b/, 'business income / treasury assets'],
  ];
  return tokenMap.filter(([pattern]) => pattern.test(raw)).map(([, label]) => label);
}

function sourceOfFundsIssues(caseData: KYCCase, requirementId: string | undefined, text: string): string[] {
  if (!requirementId || !['institution_onboarding_form', 'declaration_source_of_fund_wealth', 'source_of_funds'].includes(requirementId)) {
    return [];
  }
  const expected = sourceOfFundsTokens(caseData);
  if (!expected.length) return [];
  const normalized = text.toLowerCase();
  const missing = expected.filter((token) => {
    if (token.includes('crypto')) return !/\bcrypto|digital asset|virtual asset|btc|bitcoin|usdt|wallet\b/.test(normalized);
    if (token.includes('mining')) return !/\bmining|miner|hashrate|antpool|mining pool\b/.test(normalized);
    if (token.includes('financing')) return !/\bfinanc|loan|investor|lender|fundraising|shareholder loan\b/.test(normalized);
    return !/\bbusiness income|operating income|revenue|treasury\b/.test(normalized);
  });
  return missing.map((token) => `Case source of funds mentions ${token}, but this document does not clearly mention it.`);
}

function buildReviewSignals(caseData: KYCCase, requirementId: string | undefined, extractedText: string, extractionMethod: string) {
  const missingFields = missingFieldLabels(requirementId, extractedText);
  const issues = [...sourceOfFundsIssues(caseData, requirementId, extractedText)];
  const riskFlags: string[] = [];

  if (!extractedText.trim()) {
    issues.push('No reliable text could be extracted from this file.');
    riskFlags.push('no_extractable_text');
  }
  if (missingFields.length) {
    riskFlags.push('missing_required_fields');
    issues.push(`Potential blank required fields: ${missingFields.join(', ')}.`);
  }
  if (sourceOfFundsIssues(caseData, requirementId, extractedText).length) {
    riskFlags.push('source_of_funds_needs_reconciliation');
  }
  if (extractionMethod === 'binary') riskFlags.push('unsupported_or_scanned_file');

  const recommendations = issues.length
    ? [
        'KYC team should review the highlighted fields before accepting this document.',
        'If the issue is confirmed, ask the client to resubmit or clarify in the follow-up email.',
      ]
    : ['No obvious missing field was detected by automated rules. KYC team should still verify before accepting.'];

  const followUpPoints = [
    ...missingFields.map((field) => `Please complete ${field}.`),
    ...sourceOfFundsIssues(caseData, requirementId, extractedText).map((issue) => `Please clarify: ${issue}`),
  ];

  return {
    missingFields,
    issues,
    riskFlags,
    recommendations,
    followUpPoints,
    severity: issues.length ? 'medium' as const : 'low' as const,
  };
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

  const signals = buildReviewSignals(caseData, match?.id, extractedText, extractionMethod);
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
    riskFlags: Array.from(new Set([...(extractedText ? ['manual_review_recommended'] : []), ...signals.riskFlags])),
    missingFields: signals.missingFields,
    issues: signals.issues,
    recommendations: signals.recommendations,
    followUpPoints: signals.followUpPoints,
    severity: signals.severity,
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
    missingFields: Array.isArray(candidate.missingFields) ? candidate.missingFields.slice(0, 12) : fallback.missingFields,
    issues: Array.isArray(candidate.issues) ? candidate.issues.slice(0, 12) : fallback.issues,
    recommendations: Array.isArray(candidate.recommendations) ? candidate.recommendations.slice(0, 8) : fallback.recommendations,
    followUpPoints: Array.isArray(candidate.followUpPoints) ? candidate.followUpPoints.slice(0, 8) : fallback.followUpPoints,
    severity: candidate.severity || fallback.severity,
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
  "missingFields": ["blank or missing required fields"],
  "issues": ["specific review issues, including inconsistencies with case source of funds if any"],
  "recommendations": ["KYC reviewer actions"],
  "followUpPoints": ["client-facing follow-up requests"],
  "severity": "low|medium|high",
  "requiresHumanReview": true
}

Rules:
- Use the file content, not the filename alone.
- Only pick a suggestedRequirementId from the provided checklist options.
- Check whether required fields appear blank, whether signature/date fields look incomplete, and whether source-of-funds statements are consistent with the case source of funds.
- Do not claim a template wording comparison passed unless the supplied text clearly supports it.
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
