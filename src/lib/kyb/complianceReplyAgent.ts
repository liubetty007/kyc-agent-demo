import { getClaudeJson, hasClaudeConfigured, optionallyPolishText } from './claude';
import { inferComplianceOutcomeFromText, outcomeForAutomaticComplianceHandling } from './complianceOutcome';
import { extractNewReplyText } from './complianceReplyText';
import type { KYCCase } from './types';

type ComplianceReplyAnalysis = {
  outcome: 'approved' | 'rejected' | 'request_more_info' | 'edd_required' | 'unclear';
  summary: string;
  requested_items: string[];
  client_email_subject: string;
  client_email_body: string;
};

function fallbackAnalysis(caseData: KYCCase, complianceText: string): ComplianceReplyAnalysis {
  const stripped = extractNewReplyText(complianceText);
  const outcome = outcomeForAutomaticComplianceHandling(inferComplianceOutcomeFromText(complianceText), complianceText);

  const body = stripped
    ? `Dear ${caseData.companyName} Team,\n\nThank you for your cooperation with our onboarding process.\n\nFollowing our internal compliance review, please note the following:\n\n${stripped}\n\nPlease let us know if you have any questions.\n\nBest regards,\nKYC Team`
    : `Dear ${caseData.companyName} Team,\n\nThank you for your cooperation. We will follow up with you shortly regarding the next steps.\n\nBest regards,\nKYC Team`;

  return {
    outcome,
    summary: stripped.slice(0, 400) || complianceText.slice(0, 200),
    requested_items: [],
    client_email_subject: `Compliance Follow-up – ${caseData.companyName}`,
    client_email_body: body,
  };
}

export async function analyzeComplianceReplyAndDraftClientEmail(
  caseData: KYCCase,
  complianceReply: { subject: string; body: string; from: string },
): Promise<ComplianceReplyAnalysis> {
  const strippedBody = extractNewReplyText(complianceReply.body);
  const fallback = fallbackAnalysis(caseData, complianceReply.body);
  if (!hasClaudeConfigured()) return fallback;

  const prompt = `You are a KYC operations assistant. A compliance reviewer replied to a KYC case by email.

Case:
- Company: ${caseData.companyName}
- Case ID: ${caseData.id}
- Jurisdiction: ${caseData.jurisdiction}

Compliance reply (new text only, quoted history removed):
From: ${complianceReply.from}
Subject: ${complianceReply.subject}
Body:
${strippedBody || complianceReply.body}

Write a client follow-up email based ONLY on what compliance said in their reply.
Do NOT invent missing checklist items.
Do NOT copy the original KYC-to-compliance package or agent review questions unless compliance explicitly asked the client for them.

Return JSON only:
{
  "outcome": "approved|rejected|request_more_info|edd_required|unclear",
  "summary": "short Chinese summary of compliance feedback",
  "requested_items": ["only items compliance explicitly asked for"],
  "client_email_subject": "email subject to client",
  "client_email_body": "polished email body to client, professional tone, plain text"
}

Important:
- If compliance only asks the client/KYC to provide missing documents (e.g. COI, 补齐, 缺少), outcome MUST be request_more_info, NOT rejected.
- Use rejected only when compliance clearly refuses onboarding.`;

  const parsed = await getClaudeJson(prompt, fallback);
  parsed.outcome = outcomeForAutomaticComplianceHandling(parsed.outcome, complianceReply.body);
  if (!parsed.client_email_body?.trim()) {
    parsed.client_email_body = await optionallyPolishText(
      `Rewrite this client follow-up email professionally. Keep it based only on the compliance reply:\n\n${fallback.client_email_body}`,
      fallback.client_email_body,
    );
  }
  return parsed;
}

export function formatClientEmailDraft(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body.trim()}`;
}
