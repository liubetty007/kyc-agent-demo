import type { KYCCase } from './types';
import { formatOpeningEmailChecklist } from './openingEmailChecklist';

const GUIDE_ATTACHMENT = 'Antalpha Institutional Cooperation Guide_XXX.pdf';

export function generateOpeningEmail(caseData: KYCCase): string {
  const checklist = formatOpeningEmailChecklist(caseData);

  if (caseData.language === 'zh') {
    return `Subject: 【Antalpha】機構合作指南_${caseData.companyName}

尊敬的 ${caseData.companyName} 團隊：

感謝您對 Antalpha 的支持。

以下為 KYC 申請相關必繳交文件，請您參閱。機構文件準備好後，請直接回覆本郵件供專員確認。

${checklist}

溫馨提醒：
1. 任何外語文件，請提交文件正本與律師公證的中/英文翻譯副本。
2. 資金/財富來源聲明：請提供財富累積的時間點、形式、合作或工作機構，以及相關數量或金額。
3. 股權結構圖需完整穿透至 UBO，包含持股比例（%）、董事全名、簽名、日期，以及「我在此聲明所提供的信息均為真實、完全且準確」聲明。
4. 線上身份認證：如需進行線上身份認證，服務運營在收到申請文件後會另行提供鏈接，請備妥護照。
5. 最終受益人（UBO）包含直接或間接持有公司股份或控制權 25% 或以上的自然人。
6. 當前住址證明：請提供近三個月內的水電費賬單、銀行對賬單或官方稅單（任一文件）。
7. 授權代表的交易執行及合同簽署權限，請參考 Authorization Letter。

如有任何疑問，請隨時與我們聯繫。感謝您的協助！

Antalpha Onboarding Team`;
  }

  return `Subject: [Antalpha] Institutional Cooperation Guide_${caseData.companyName}

Dear ${caseData.companyName} Team,

Thank you for your support in Antalpha.

We have attached the KYC-related documents to this email for your reference.
Once your institutional documents are ready, please reply to this email for confirmation.

${checklist}

Notes:
1. Please submit the original document together with an English or Chinese translation certified by a lawyer for any foreign-language document.
2. Declaration of Source of Funds/Wealth: please provide a detailed description including timelines, organizational structures, partnerships, and specific monetary figures related to wealth accumulation.
3. The Ownership Structure Chart should fully disclose UBOs, shareholding percentages, and the director's name, signature and date, together with the statement: "I declare that the information provided herein is true, complete, and accurate."
4. If online identity verification is required, the Operation Service Team will provide a link after receiving the application documents. Please have the passport ready.
5. A UBO is a natural person who directly or indirectly owns or controls 25% or more of the company.
6. Proof of Address: please provide one document issued within the past 3 months, such as a utility bill, bank statement, or official tax document.
7. Please refer to the Authorization Letter for Authorized Representative privileges.

If you have any questions, please feel free to contact us. Thank you for your cooperation.

Best regards,
Antalpha Onboarding Team`;
}

export { GUIDE_ATTACHMENT };
