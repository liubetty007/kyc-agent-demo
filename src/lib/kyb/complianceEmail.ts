import { COMPLIANCE_TEAM_EMAIL, KYC_TEAM_EMAIL } from './mailbox';
import type { KYCCase, ReviewResult } from './types';

export function generateComplianceEmail(caseData: KYCCase, review: ReviewResult): string {
  const riskFlags = review.businessAssessment.riskFlags.length
    ? review.businessAssessment.riskFlags.map((flag) => `- ${flag}`).join('\n')
    : '- No major business risk flags identified by the Agent.';
  const documents = review.receivedDocuments.length
    ? review.receivedDocuments.map((doc) => `- ${doc.name}: ${doc.status}`).join('\n')
    : '- No documents have been accepted yet.';
  const openItems = review.questionsForClient.length
    ? review.questionsForClient.map((item) => `- ${item}`).join('\n')
    : '- No open client questions noted by the Agent.';

  return `Subject: Compliance Review Request – ${caseData.companyName} (${caseData.id})

From: ${KYC_TEAM_EMAIL}
To: ${COMPLIANCE_TEAM_EMAIL}

Dear Compliance Team,

KYC Team has prepared the case package for your review.

Case summary:
- Case ID: ${caseData.id}
- Company: ${caseData.companyName}
- Registration place: ${caseData.jurisdiction}${caseData.usState ? ` (${caseData.usState})` : ''}
- Business type: ${caseData.businessType}
- Agent recommendation: ${review.recommendedNextAction}

Risk flags:
${riskFlags}

Documents included / reviewed:
${documents}

Open questions or missing items:
${openItems}

The compliance pack and available case documents are ready for Compliance Team review. Please advise whether this case can proceed, requires EDD, requires more information, or should be rejected.

Best regards,
KYC Team`;
}
