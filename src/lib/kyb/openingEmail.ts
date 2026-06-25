import type { KYCCase } from './types';

const GUIDE_ATTACHMENT = 'Antalpha Institutional Cooperation Guide_XXX.pdf';

export function generateOpeningEmail(caseData: KYCCase): string {
  if (caseData.language === 'zh') {
    return `Subject: 【Antalpha】机构合作指南及开户文件清单_${caseData.companyName}

尊敬的 ${caseData.companyName} 团队：

感谢贵司对 Antalpha 机构业务的支持。

为启动机构开户及 KYB/KYC 审核流程，请查阅附件中的 Antalpha 机构合作指南，并根据指南准备开户所需文件。

附件：${GUIDE_ATTACHMENT}

初审阶段通常需要以下资料：
- 公司注册文件、章程或同等公司文件
- 授权签署人、董事、UBO/主要股东的身份证明及住址证明
- 股权架构图，需穿透至最终受益人
- 资金来源 / 资产来源说明及支持性证明
- 适用的 Antalpha 开户表格、授权书、董事决议及 NDA

如本次需开通 NS 相关业务，请同时填写并提交 NS 版本文件。

收到文件后，KYC 团队会进行初审；如有缺失、填写不完整或需进一步说明的事项，我们会在原邮件线程中继续跟进。

如有任何疑问，请随时与我们联系。

此致，
KYC Team`;
  }

  return `Subject: Antalpha Institutional Cooperation Guide and Account Opening Documents

Dear ${caseData.companyName} Team,

Thank you for your interest in institutional cooperation with Antalpha.

To start the corporate account opening and KYB review process, please review the attached Antalpha Institutional Cooperation Guide and provide the required onboarding documents listed in the guide.

Attachment: ${GUIDE_ATTACHMENT}

For the initial review, please share the available corporate documents, authorized signatory information, UBO/director identification documents, proof of address, and source of funds / source of assets evidence where applicable. Additional documents may be requested based on jurisdiction, business model, and compliance review requirements.

If NS business is required for this case, please also complete and return the NS version documents.

Once we receive the documents, our KYC Team will review the submission and follow up if any information is missing or requires clarification.

Best regards,
KYC Team`;
}

export { GUIDE_ATTACHMENT };
