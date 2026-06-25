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

type ChecklistMatch = {
  item?: ChecklistOption;
  confidence: number;
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

function scoreChecklistMatch(options: ChecklistOption[], filename: string, extractedText: string): ChecklistMatch {
  const haystack = `${filename}\n${extractedText}`.toLowerCase();
  const best = options
    .map((item) => {
      let score = 0;
      const normalizedId = item.id.replaceAll('_', ' ');
      const normalizedName = item.name.toLowerCase();
      if (haystack.includes(normalizedName)) score += 6;
      if (haystack.includes(normalizedId)) score += 5;
      if (haystack.includes(item.category.toLowerCase())) score += 1;
      const tokens = [item.id, item.name, item.category]
        .join(' ')
        .toLowerCase()
        .replace(/[_/()-]+/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 3);
      score += tokens.reduce((count, token) => count + (haystack.includes(token) ? 1 : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!extractedText.trim()) return { confidence: 0.18 };
  if (!best) return { confidence: 0.28 };
  if (best.score >= 8) return { item: best.item, confidence: 0.95 };
  if (best.score >= 5) return { item: best.item, confidence: 0.82 };
  if (best.score >= 3) return { item: best.item, confidence: 0.68 };
  return { item: best.item, confidence: 0.52 };
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

function hasReceivedDoc(caseData: KYCCase, requirementIds: string[]): boolean {
  return caseData.receivedDocuments.some(
    (doc) => requirementIds.includes(doc.requirementId) && (doc.status === 'received' || doc.status === 'accepted'),
  );
}

function crossDocumentConsistencyIssues(caseData: KYCCase, requirementId: string | undefined, text: string): string[] {
  const normalized = text.toLowerCase();
  const issues: string[] = [];

  const hasOwnershipChart =
    requirementId === 'ownership_structure_chart'
    || hasReceivedDoc(caseData, ['ownership_structure_chart']);
  const hasIndividualId = hasReceivedDoc(caseData, ['passport_or_id', 'online_identity_verification']);
  const hasAddressProof = hasReceivedDoc(caseData, ['proof_of_current_residential_address']);
  const hasLargeShareholder =
    caseData.individuals.some((person) => (person.ownershipPercentage || 0) >= 25)
    || /(?:25|二十五)\s*%|(?:[3-9]\d|100)\s*%|majority shareholder|controlling shareholder|ubo|beneficial owner/i.test(text);

  if (hasOwnershipChart && hasLargeShareholder && (!hasIndividualId || !hasAddressProof)) {
    issues.push('Ownership information indicates a shareholder/UBO at or above 25%, but corresponding individual ID/identity verification and address proof are not both on file.');
  }

  const caseMining = /mining|矿|miner|hashrate|antpool|mining pool/i.test(`${caseData.businessType} ${caseData.sourceOfFunds}`);
  const documentMining = /mining|矿|miner|hashrate|antpool|mining pool/i.test(text);
  const documentIt = /\bit\b|software|developer|development|technology service|技术开发|软件|信息技术/i.test(text);
  if (caseMining && requirementId === 'institution_onboarding_form' && documentIt && !documentMining) {
    issues.push('Case is described as mining-related, but the onboarding form appears to describe IT/software development rather than mining activity.');
  }
  if (!caseMining && documentMining && requirementId === 'business_description') {
    issues.push('Business proof appears to describe mining activity, but the case business type/source of funds does not clearly identify mining.');
  }

  const scaleMatch = normalized.match(/(?:usd|us\$|\$)\s?([\d,.]+)\s?(m|million|k|thousand)?|([\d,.]+)\s?(m|million|k|thousand)?\s?(?:usd|us dollars)/i);
  const sourceText = caseData.sourceOfFunds.toLowerCase();
  if (scaleMatch && !/financial statement|bank statement|exchange statement|revenue|income|audit|loan|financing|treasury|财务|银行|收入|贷款|融资/.test(sourceText)) {
    issues.push('Document mentions business scale or transaction amount, but the case source-of-funds note does not provide clear supporting basis for that scale.');
  }

  return issues;
}

function buildReviewSignals(caseData: KYCCase, requirementId: string | undefined, extractedText: string, extractionMethod: string) {
  const missingFields = missingFieldLabels(requirementId, extractedText);
  const issues = [
    ...sourceOfFundsIssues(caseData, requirementId, extractedText),
    ...crossDocumentConsistencyIssues(caseData, requirementId, extractedText),
  ];
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
  if (crossDocumentConsistencyIssues(caseData, requirementId, extractedText).length) {
    riskFlags.push('cross_document_consistency_review');
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
    ...crossDocumentConsistencyIssues(caseData, requirementId, extractedText).map((issue) => `Please clarify: ${issue}`),
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
  const options = checklistOptions(caseData);
  const match = scoreChecklistMatch(options, filename, extractedText);

  const signals = buildReviewSignals(caseData, match.item?.id, extractedText, extractionMethod);
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
      ? `File content looks closest to ${match.item?.name || 'an unmatched checklist item'}.`
      : 'Unable to extract meaningful text from the file. Please review manually.',
    suggestedRequirementId: match.item?.id,
    suggestedRequirementName: match.item?.name,
    confidence: match.confidence,
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
  const issues = fallback.issues;
  const recommendations = fallback.recommendations
    .filter((item) => !/no action (?:required|needed)/i.test(item));
  if (issues.length && !recommendations.some((item) => /review|resubmit|clarify|follow/i.test(item))) {
    recommendations.unshift('KYC team should review the highlighted issues before accepting this document.');
  }

  return {
    filename: candidate.filename || fallback.filename,
    mimeType: candidate.mimeType || fallback.mimeType,
    storageObject: candidate.storageObject || fallback.storageObject,
    extractionMethod: candidate.extractionMethod || fallback.extractionMethod,
    extractedTextPreview: candidate.extractedTextPreview || fallback.extractedTextPreview,
    summary: fallback.summary,
    suggestedRequirementId: fallback.suggestedRequirementId,
    suggestedRequirementName: fallback.suggestedRequirementName,
    confidence: fallback.confidence,
    keyPoints: fallback.keyPoints,
    riskFlags: fallback.riskFlags,
    missingFields: fallback.missingFields,
    issues,
    recommendations,
    followUpPoints: fallback.followUpPoints,
    severity: fallback.severity,
    requiresHumanReview: true,
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
  sourceOfFunds: input.caseData.sourceOfFunds,
  status: input.caseData.status,
  individuals: input.caseData.individuals,
  receivedDocuments: input.caseData.receivedDocuments.map((doc) => ({
    requirementId: doc.requirementId,
    name: doc.name,
    status: doc.status,
  })),
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
- Check cross-document consistency: business scale vs source-of-funds basis; ownership chart with >=25% shareholders vs missing personal ID/address/identity verification; business proof activity vs onboarding form activity; mining/crypto/financing statements vs submitted evidence.
- If the document says one business activity but case notes or other received documents indicate another, flag the mismatch clearly.
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
