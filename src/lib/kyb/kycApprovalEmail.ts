import type { KYCCase } from './types';

export function buildKycApprovalEmailDraft(caseData: KYCCase): string {
  if (caseData.language === 'zh') {
    return `Subject: 【Antalpha】機構合作指南_${caseData.companyName}_KYC已通過

尊敬的 ${caseData.companyName} 團隊：

感謝您的耐心等候。

恭喜您！貴司資料已通過審核。

我們特此確認，您已同意我們可向貸方披露並共享我們從您處收集的 KYC 資料及其他相關信息，以供其進行開戶、信貸審批及其他相關事項的考量之用。

Antalpha 為了交易安全、合法和合規將定期進行機構檢查；如業務進行中需補充文件，將另行通知。

如有任何問題，請隨時與我們聯繫。

祝您有個美好的 Antalpha 旅程。

Antalpha Operation Service Team`;
  }

  return `Subject: [Antalpha] Institutional Cooperation Guide_${caseData.companyName}_KYC completed

Dear ${caseData.companyName} Team,

Thank you for your patience.

Congratulations! Your institutional KYC has been reviewed and approved.

We hereby confirm your consent to disclose and share your KYC and other information we collected from you with the lender for its own account opening, credit approval, and other consideration.

For security and compliance purposes, Antalpha will conduct periodic institutional checks. If additional documents are required, a separate notification will be sent.

If you have any questions, please do not hesitate to contact us at any time.

Thank you for your support once again, and wishing you a wonderful journey with Antalpha.

Best regards,
Antalpha Onboarding Team`;
}
