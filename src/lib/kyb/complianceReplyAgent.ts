import { getLlmJson, hasLlmConfigured, optionallyPolishText } from './claude';
import { extractNewReplyText } from './complianceReplyText';
import type { KYCCase } from './types';

type ComplianceReplyAnalysis = {
  summary: string;
  client_email_body: string;
};

function fallbackAnalysis(caseData: KYCCase, complianceText: string): ComplianceReplyAnalysis {
  const stripped = extractNewReplyText(complianceText);
  const body = stripped
    ? `Dear ${caseData.companyName} Team,\n\nThank you for your cooperation with our onboarding process.\n\nFollowing our internal compliance review:\n\n${stripped}\n\nPlease let us know if you have any questions.\n\nBest regards,\nKYC Team`
    : `Dear ${caseData.companyName} Team,\n\nThank you for your cooperation. We will follow up with you shortly regarding the next steps.\n\nBest regards,\nKYC Team`;

  return {
    summary: stripped.slice(0, 400) || complianceText.slice(0, 200),
    client_email_body: body,
  };
}

export async function analyzeComplianceReplyAndDraftClientEmail(
  caseData: KYCCase,
  complianceReply: { subject: string; body: string; from: string },
): Promise<ComplianceReplyAnalysis> {
  const strippedBody = extractNewReplyText(complianceReply.body);
  const fallback = fallbackAnalysis(caseData, complianceReply.body);
  if (!hasLlmConfigured()) return fallback;

  const prompt = `You are a KYC operations assistant. Draft an email from KYC Team to the client.

Compliance reviewer wrote (new text only):
From: ${complianceReply.from}
Subject: ${complianceReply.subject}
Body:
${strippedBody || complianceReply.body}

Write ONLY a client-facing email body based on what compliance said.
- Do NOT list what the client already submitted.
- Do NOT list checklist items, missing documents, or agent review unless compliance explicitly mentioned them in the reply above.
- Translate compliance feedback into clear next steps for the client.
- Professional, plain-text email body only (no Subject line).

Return JSON only:
{
  "summary": "short Chinese summary of compliance feedback for internal use",
  "client_email_body": "email body to client"
}`;

  const parsed = await getLlmJson(prompt, fallback);
  if (!parsed.client_email_body?.trim()) {
    parsed.client_email_body = await optionallyPolishText(
      `Rewrite this client email professionally. Use only the compliance reply as source:\n\n${fallback.client_email_body}`,
      fallback.client_email_body,
    );
  }
  return parsed;
}

export function formatClientEmailDraft(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body.trim()}`;
}
