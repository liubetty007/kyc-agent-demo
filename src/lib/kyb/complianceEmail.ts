import { defaultComplianceEmail, KYC_TEAM_EMAIL } from './mailbox';
import type { KYCCase, ReviewResult } from './types';

export function generateComplianceEmail(
  caseData: KYCCase,
  review: ReviewResult,
  attachmentNames: string[] = [],
  toEmail: string = defaultComplianceEmail(caseData),
): string {
  const riskFlags = review.businessAssessment.riskFlags.length
    ? review.businessAssessment.riskFlags.map((flag) => `- ${flag}`).join('\n')
    : '- No major business risk flags identified by the Agent.';
  const documents = review.receivedDocuments.length
    ? review.receivedDocuments.map((doc) => `- ${doc.name}: ${doc.status}`).join('\n')
    : '- No documents have been accepted yet.';
  const openItems = review.questionsForClient.length
    ? review.questionsForClient.map((item) => `- ${item}`).join('\n')
    : '- No open client questions noted by the Agent.';

  const attachmentList = attachmentNames.length
    ? attachmentNames.map((name) => `- ${name}`).join('\n')
    : '- No KYC-accepted documents attached yet. Please Accept files before sending.';

  if (caseData.language === 'zh') {
    return `Subject: 合规审核申请 - ${caseData.companyName} (${caseData.id})

From: ${KYC_TEAM_EMAIL}
To: ${toEmail}

合规团队您好：

KYC 团队已完成该客户的初步整理，现提交合规审核。

案件概要：
- Case ID: ${caseData.id}
- 公司名称: ${caseData.companyName}
- 注册地: ${caseData.jurisdiction}${caseData.usState ? ` (${caseData.usState})` : ''}
- 业务类型: ${caseData.businessType}
- Agent 建议: ${review.recommendedNextAction}

风险提示：
${riskFlags}

已审核 / 已收到文件：
${documents}

本邮件随附 KYC 已 Accept 文件：
${attachmentList}

未完成事项 / 待确认问题：
${openItems}

请审核该案件是否可以继续推进、是否需 EDD、是否需补充资料，或是否应拒绝开户。

谢谢。
KYC Team`;
  }

  return `Subject: Compliance Review Request – ${caseData.companyName} (${caseData.id})

From: ${KYC_TEAM_EMAIL}
To: ${toEmail}

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

KYC-accepted attachments (included with this email):
${attachmentList}

Open questions or missing items:
${openItems}

The compliance pack and available case documents are ready for Compliance Team review. Please advise whether this case can proceed, requires EDD, requires more information, or should be rejected.

Best regards,
KYC Team`;
}
