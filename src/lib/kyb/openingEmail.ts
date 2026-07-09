import type { KYCCase } from './types';
import { formatOpeningEmailChecklist } from './openingEmailChecklist';

const GUIDE_ATTACHMENT = 'Antalpha Institutional Cooperation Guide_XXX.pdf';

export function generateOpeningEmail(caseData: KYCCase): string {
  const checklist = formatOpeningEmailChecklist(caseData);
  if (caseData.language === 'zh') {
    return `Subject: 【Antalpha】机构合作指南及开户文件清单_${caseData.companyName}

尊敬的 ${caseData.companyName} 团队：

感谢贵司对 Antalpha 机构业务的支持。

为启动机构开户及 KYB/KYC 审核流程，请根据以下清单准备开户所需文件。带「邮件附件（模板）」的项目请参考本邮件附件填写；带「客户自备并回传」的项目请由贵司自行准备后回传（例如公司注册证、股权架构图等）。

${checklist}

温馨提示：
- 股权架构图需完整穿透到 UBO，包含持股比例（%）与董事全名/签名/日期。
- 线上身份认证：关联人士在收到申请文件后，运营团队会另行提供链接。
- 任何外语文件，请提交正本及经律师公证的中/英文翻译副本。

收到文件后，KYC 团队会进行初审；如有缺失、填写不完整或需进一步说明的事项，我们会在原邮件线程中继续跟进。

如有任何疑问，请随时与我们联系。

此致，
KYC Team`;
  }

  return `Subject: Antalpha Institutional Cooperation Guide and Account Opening Documents

Dear ${caseData.companyName} Team,

Thank you for your interest in institutional cooperation with Antalpha.

To start the corporate account opening and KYB review process, please prepare the documents below. Items marked "Email attachment (template)" are included in this email for completion. Items marked "Client to prepare and return" must be prepared by your team (for example company registration documents and ownership structure charts).

${checklist}

Reminders:
- Ownership structure charts must trace to UBOs and include holding percentages plus director signature and date.
- Online identity verification links will be provided separately after we receive your initial submission.
- Foreign-language documents should include originals plus certified Chinese/English translations where applicable.

Once we receive the documents, our KYC Team will review the submission and follow up if any information is missing or requires clarification.

Best regards,
KYC Team`;
}

export { GUIDE_ATTACHMENT };
