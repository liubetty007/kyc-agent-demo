export type AssistantSession = {
  mode: 'idle' | 'create_case' | 'disambiguate_case' | 'upload_document';
  createCaseDraft?: CreateCaseDraft;
  candidateCases?: AssistantCaseOption[];
  pendingIntent?: 'query_progress' | 'upload_document';
  uploadDraft?: {
    caseId?: string;
    companyName?: string;
    requirementId?: string;
    requirementName?: string;
  };
};

export type AssistantCaseOption = {
  id: string;
  companyName: string;
  contactEmail?: string;
};

export type CreateCaseDraft = {
  companyName?: string;
  contactEmail?: string;
  jurisdiction?: string;
  usState?: string;
  businessType?: string;
  sourceOfFunds?: string;
  needsNsBusiness?: boolean;
  language?: 'zh' | 'en';
};

export type AssistantChoice = {
  id: string;
  label: string;
  sublabel?: string;
};

export type AssistantLink = {
  href: string;
  label: string;
};

export const assistantCapabilitiesMessage = `我还不太确定你的意思。你可以直接跟我说：

1. **创建新 Case** — 例如：「帮我创建一个新客户，公司叫 ABC Capital，注册地香港，矿业贷，邮箱 abc@example.com」
2. **查询客户进展** — 例如：「查一下 ABC 的进度」或「tessst 现在什么状态」
3. **补充资料** — 上传文件并说明：「这是 ABC 的 NDA」或「tessst 的董事决议」

如果信息不完整，我会继续追问；如果客户名称有多个匹配，我会让你从列表里选。`;

export function initialAssistantSession(): AssistantSession {
  return { mode: 'idle' };
}
