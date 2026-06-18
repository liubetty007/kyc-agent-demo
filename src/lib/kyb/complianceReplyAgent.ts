import { getClaudeJson, hasClaudeConfigured, optionallyPolishText } from './claude';
import { generateEmailDraft } from './email';
import type { KYCCase, ReviewResult } from './types';

type ComplianceReplyAnalysis = {
  outcome: 'approved' | 'rejected' | 'request_more_info' | 'edd_required' | 'unclear';
  summary: string;
  requested_items: string[];
  client_email_subject: string;
  client_email_body: string;
};

function fallbackAnalysis(caseData: KYCCase, complianceText: string, review: ReviewResult): ComplianceReplyAnalysis {
  const lower = complianceText.toLowerCase();
  let outcome: ComplianceReplyAnalysis['outcome'] = 'request_more_info';
  if (lower.includes('reject') || lower.includes('拒绝')) outcome = 'rejected';
  else if (lower.includes('approve') || lower.includes('通过')) outcome = 'approved';
  else if (lower.includes('edd')) outcome = 'edd_required';

  const draft = generateEmailDraft(caseData, review);
  const body = draft.replace(/^Subject:.*\n+/i, '').trim();
  return {
    outcome,
    summary: complianceText.slice(0, 400),
    requested_items: review.questionsForClient,
    client_email_subject: `Additional Documents Required – ${caseData.companyName}`,
    client_email_body: body,
  };
}

export async function analyzeComplianceReplyAndDraftClientEmail(
  caseData: KYCCase,
  review: ReviewResult,
  complianceReply: { subject: string; body: string; from: string },
): Promise<ComplianceReplyAnalysis> {
  const fallback = fallbackAnalysis(caseData, complianceReply.body, review);
  if (!hasClaudeConfigured()) return fallback;

  const prompt = `You are a KYC operations assistant. A compliance reviewer replied to a KYC case by email.

Case:
- Company: ${caseData.companyName}
- Case ID: ${caseData.id}
- Jurisdiction: ${caseData.jurisdiction}

Compliance reply:
From: ${complianceReply.from}
Subject: ${complianceReply.subject}
Body:
${complianceReply.body}

Existing KYC review questions:
${review.questionsForClient.map((item) => `- ${item}`).join('\n') || '- none'}

Return JSON only:
{
  "outcome": "approved|rejected|request_more_info|edd_required|unclear",
  "summary": "short Chinese summary of compliance feedback",
  "requested_items": ["list of documents/actions client must provide in Chinese or English"],
  "client_email_subject": "email subject to client",
  "client_email_body": "polished email body to client explaining what to supplement, professional tone, plain text"
}`;

  const parsed = await getClaudeJson(prompt, fallback);
  if (!parsed.client_email_body?.trim()) {
    parsed.client_email_body = await optionallyPolishText(
      `Rewrite this client follow-up email professionally:\n\n${fallback.client_email_body}`,
      fallback.client_email_body,
    );
  }
  return parsed;
}

export function formatClientEmailDraft(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body.trim()}`;
}
