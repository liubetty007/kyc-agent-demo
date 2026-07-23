import { generateChecklist } from './checklist';
import { caseStatusLabel } from './complianceReview';
import { classifyAttachmentFilename } from './attachmentClassification';
import { getLlmJson } from './claude';
import type { BusinessType, CaseLanguage, Jurisdiction, KYCCase } from './types';
import {
  assistantCapabilitiesMessage,
  type AssistantCaseOption,
  type AssistantChoice,
  type AssistantLink,
  type AssistantSession,
  type CreateCaseDraft,
} from './homeAssistantShared';

export type {
  AssistantCaseOption,
  AssistantChoice,
  AssistantLink,
  AssistantSession,
  CreateCaseDraft,
} from './homeAssistantShared';
export { assistantCapabilitiesMessage, initialAssistantSession } from './homeAssistantShared';

export type AssistantReply = {
  message: string;
  session: AssistantSession;
  links?: AssistantLink[];
  choices?: AssistantChoice[];
  createdCaseId?: string;
};

type ParsedAssistantInput = {
  intent: 'create_case' | 'query_progress' | 'upload_document' | 'help' | 'unclear';
  companyName?: string;
  contactEmail?: string;
  jurisdiction?: Jurisdiction;
  usState?: string;
  businessType?: BusinessType;
  sourceOfFunds?: string;
  needsNsBusiness?: boolean;
  language?: CaseLanguage;
  queryName?: string;
  documentHint?: string;
  choiceIndex?: number;
};

const JURISDICTIONS: Jurisdiction[] = [
  'Hong Kong',
  'Singapore',
  'BVI',
  'Cayman',
  'United States',
  'European countries',
  'Other offshore',
  'Other countries',
  'Mainland China',
];

const JURISDICTION_ALIASES: Record<string, Jurisdiction> = {
  hk: 'Hong Kong',
  香港: 'Hong Kong',
  hongkong: 'Hong Kong',
  'hong kong': 'Hong Kong',
  sg: 'Singapore',
  新加坡: 'Singapore',
  singapore: 'Singapore',
  bvi: 'BVI',
  cayman: 'Cayman',
  开曼: 'Cayman',
  us: 'United States',
  usa: 'United States',
  美国: 'United States',
  'united states': 'United States',
  europe: 'European countries',
  欧洲: 'European countries',
  offshore: 'Other offshore',
  离岸: 'Other offshore',
  china: 'Mainland China',
  中国大陆: 'Mainland China',
  内地: 'Mainland China',
};

const CREATE_FIELD_LABELS: Record<string, string> = {
  companyName: '机构名称（公司全名）',
  jurisdiction: '注册地（如香港、新加坡、BVI、美国）',
  businessType: '业务类型（矿业贷 或 质押借贷）',
  sourceOfFunds: '资金来源说明',
};

const CAPABILITIES_MESSAGE = assistantCapabilitiesMessage;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseChoiceIndex(message: string): number | undefined {
  const trimmed = message.trim();
  const numeric = trimmed.match(/^([1-9]\d*)$/);
  if (numeric) return Number(numeric[1]) - 1;
  const zh = trimmed.match(/第\s*([1-9]\d*)\s*个/);
  if (zh) return Number(zh[1]) - 1;
  return undefined;
}

function normalizeJurisdiction(value?: string): Jurisdiction | undefined {
  if (!value) return undefined;
  const direct = JURISDICTIONS.find((item) => item.toLowerCase() === value.toLowerCase());
  if (direct) return direct;
  return JURISDICTION_ALIASES[normalizeText(value)];
}

function normalizeBusinessType(value?: string): BusinessType | undefined {
  if (!value) return undefined;
  const text = normalizeText(value);
  if (['btc_loan', 'btc loan', '质押借贷', '币贷', 'btc'].some((token) => text.includes(token))) return 'btc_loan';
  if (['mining_loan', 'mining loan', '矿业贷', '矿贷', 'mining'].some((token) => text.includes(token))) return 'mining_loan';
  return undefined;
}

function detectIntentHeuristic(message: string): ParsedAssistantInput['intent'] {
  const text = normalizeText(message);
  if (!text || /^(help|帮助|你能做什么|你会什么|怎么用)$/.test(text)) return 'help';
  if (/创建|新建|开户|create case|new case|add case/.test(text)) return 'create_case';
  if (/进展|进度|状态|查一下|查询|怎么样|progress|status/.test(text)) return 'query_progress';
  if (/上传|补充|补交|upload|attach|这份是|这是.+的/.test(text)) return 'upload_document';
  return 'unclear';
}

function extractCompanyQuery(message: string): string | undefined {
  const patterns = [
    /(?:查|看|查询|查一下|进度|进展|状态).{0,12}?([A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff\s.&-]{1,60})/,
    /([A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9\u4e00-\u9fff\s.&-]{1,60})(?:的)?(?:进度|进展|状态)/,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && !/客户|案件|case|进度|进展|状态/.test(candidate)) return candidate;
  }
  const trimmed = message.trim();
  if (trimmed.length >= 2 && trimmed.length <= 40 && !/创建|新建|上传|补充/.test(trimmed)) return trimmed;
  return undefined;
}

function mergeDraft(draft: CreateCaseDraft, parsed: ParsedAssistantInput): CreateCaseDraft {
  return {
    ...draft,
    companyName: parsed.companyName || draft.companyName,
    contactEmail: parsed.contactEmail || draft.contactEmail,
    jurisdiction: parsed.jurisdiction || draft.jurisdiction,
    usState: parsed.usState || draft.usState,
    businessType: parsed.businessType || draft.businessType,
    sourceOfFunds: parsed.sourceOfFunds || draft.sourceOfFunds,
    needsNsBusiness: parsed.needsNsBusiness ?? draft.needsNsBusiness,
    language: parsed.language || draft.language,
  };
}

function missingCreateFields(draft: CreateCaseDraft): string[] {
  const missing: string[] = [];
  if (!draft.companyName?.trim()) missing.push('companyName');
  if (!draft.jurisdiction) missing.push('jurisdiction');
  if (!draft.businessType) missing.push('businessType');
  if (!draft.sourceOfFunds?.trim()) missing.push('sourceOfFunds');
  return missing;
}

function askForMissingFields(draft: CreateCaseDraft): string {
  const missing = missingCreateFields(draft);
  if (!missing.length) return '';
  const lines = missing.map((field) => `- ${CREATE_FIELD_LABELS[field]}`);
  return `还差几项信息，创建 Case 前需要确认：\n${lines.join('\n')}\n\n请直接回复补充即可。`;
}

async function parseAssistantInput(message: string, session: AssistantSession): Promise<ParsedAssistantInput> {
  const choiceIndex = parseChoiceIndex(message);
  const fallback: ParsedAssistantInput = {
    intent: session.mode === 'create_case'
      ? 'create_case'
      : session.mode === 'upload_document'
        ? 'upload_document'
        : session.pendingIntent || detectIntentHeuristic(message),
    choiceIndex,
    queryName: extractCompanyQuery(message),
    companyName: session.createCaseDraft?.companyName,
    contactEmail: session.createCaseDraft?.contactEmail,
    jurisdiction: (session.createCaseDraft?.jurisdiction as Jurisdiction | undefined),
    businessType: (session.createCaseDraft?.businessType as BusinessType | undefined),
    sourceOfFunds: session.createCaseDraft?.sourceOfFunds,
    needsNsBusiness: session.createCaseDraft?.needsNsBusiness,
    language: session.createCaseDraft?.language,
  };

  const prompt = `You parse KYC home assistant commands. Return JSON only.

User message:
${message}

Current session mode: ${session.mode}
Current create-case draft: ${JSON.stringify(session.createCaseDraft || {})}
Current upload draft: ${JSON.stringify(session.uploadDraft || {})}

Supported intents:
- create_case
- query_progress
- upload_document
- help
- unclear

Extract fields when present:
companyName, contactEmail, jurisdiction, businessType, sourceOfFunds, needsNsBusiness, language, queryName, documentHint, choiceIndex

Jurisdiction must be one of: ${JURISDICTIONS.join(', ')}
businessType must be mining_loan or btc_loan

JSON shape:
{
  "intent": "create_case|query_progress|upload_document|help|unclear",
  "companyName": "string or null",
  "contactEmail": "string or null",
  "jurisdiction": "string or null",
  "businessType": "mining_loan|btc_loan|null",
  "sourceOfFunds": "string or null",
  "needsNsBusiness": true|false|null,
  "language": "zh|en|null",
  "queryName": "string or null",
  "documentHint": "string or null",
  "choiceIndex": number|null
}`;

  const parsed = await getLlmJson<ParsedAssistantInput>(prompt, fallback);
  return {
    ...fallback,
    ...parsed,
    jurisdiction: normalizeJurisdiction(parsed.jurisdiction) || fallback.jurisdiction,
    businessType: normalizeBusinessType(parsed.businessType) || fallback.businessType,
    choiceIndex: parsed.choiceIndex ?? choiceIndex,
    queryName: parsed.queryName || fallback.queryName,
    intent: parsed.intent || fallback.intent,
  };
}

export function searchCases(cases: KYCCase[], query: string): AssistantCaseOption[] {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  return cases
    .filter((caseData) => {
      const name = normalizeText(caseData.companyName);
      const email = normalizeText(caseData.contactEmail || '');
      return name.includes(normalized) || email.includes(normalized) || normalized.includes(name);
    })
    .slice(0, 8)
    .map((caseData) => ({
      id: caseData.id,
      companyName: caseData.companyName,
      contactEmail: caseData.contactEmail,
    }));
}

function summarizeCaseProgress(caseData: KYCCase): string {
  const checklist = caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData);
  const received = new Set(caseData.receivedDocuments.map((doc) => doc.requirementId));
  const missingRequired = checklist.filter((item) => item.required && !received.has(item.id));
  const lines = [
    `**${caseData.companyName}**`,
    `- 状态：${caseStatusLabel(caseData)}`,
    `- 注册地：${caseData.jurisdiction}${caseData.usState ? ` (${caseData.usState})` : ''}`,
    `- 已收到文件：${caseData.receivedDocuments.length} 份`,
  ];
  if (missingRequired.length) {
    lines.push('- 仍缺必交项：');
    for (const item of missingRequired.slice(0, 8)) lines.push(`  - ${item.name}`);
    if (missingRequired.length > 8) lines.push(`  - 另有 ${missingRequired.length - 8} 项…`);
  } else {
    lines.push('- 必交 checklist 已齐（或待 KYC 确认）。');
  }
  return lines.join('\n');
}

function disambiguationReply(
  candidates: AssistantCaseOption[],
  pendingIntent: 'query_progress' | 'upload_document',
  prefix: string,
): AssistantReply {
  return {
    message: `${prefix}\n\n我找到 ${candidates.length} 个可能匹配的客户，请回复序号或点击选择：`,
    session: {
      mode: 'disambiguate_case',
      candidateCases: candidates,
      pendingIntent,
    },
    choices: candidates.map((item, index) => ({
      id: item.id,
      label: `${index + 1}. ${item.companyName}`,
      sublabel: item.contactEmail,
    })),
  };
}

function resolveChoice(session: AssistantSession, choiceIndex?: number, message?: string): AssistantCaseOption | undefined {
  const candidates = session.candidateCases || [];
  if (choiceIndex !== undefined && candidates[choiceIndex]) return candidates[choiceIndex];
  if (!message) return undefined;
  const normalized = normalizeText(message);
  return candidates.find((item) => normalizeText(item.companyName) === normalized)
    || candidates.find((item) => normalizeText(item.companyName).includes(normalized));
}

function classifyDocumentHint(hint: string, filename: string, caseData: KYCCase) {
  const checklist = caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData);
  const allowed = new Set(checklist.map((item) => item.id));
  const hay = normalizeAttachmentFilename(`${hint} ${filename}`);
  const fromFilename = classifyAttachmentFilename(filename, allowed);
  if (fromFilename) return fromFilename;

  const rule = [
    { id: 'mutual_nda', keywords: ['nda', '保密'] },
    { id: 'board_resolution', keywords: ['董事决议', 'board resolution', 'resolution', 'br'] },
    { id: 'authorization_letter', keywords: ['授权书', 'authorization'] },
    { id: 'institution_onboarding_form', keywords: ['开户表', 'onboarding', '申请表'] },
    { id: 'ownership_structure_chart', keywords: ['股权', 'ownership', 'structure chart'] },
    { id: 'passport_or_id', keywords: ['护照', 'passport', '身份证', 'id'] },
    { id: 'proof_of_current_residential_address', keywords: ['住址', '地址证明', 'address proof'] },
    { id: 'source_of_funds', keywords: ['资金来源', 'source of funds'] },
  ].find((entry) => allowed.has(entry.id) && entry.keywords.some((keyword) => hay.includes(keyword)));

  if (!rule) return null;
  return {
    requirementId: rule.id,
    confidence: 0.82,
    reason: `Matched document hint for ${rule.id}.`,
  };
}

function normalizeAttachmentFilename(filename: string): string {
  return filename.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function handleAssistantMessage(input: {
  message: string;
  session: AssistantSession;
  cases: KYCCase[];
  canCreate: boolean;
  choiceId?: string;
}): Promise<AssistantReply> {
  const session = input.session || { mode: 'idle' };
  const parsed = await parseAssistantInput(input.message, session);

  if (session.mode === 'disambiguate_case') {
    const selected = input.choiceId && input.choiceId !== 'confirm_create'
      ? session.candidateCases?.find((item) => item.id === input.choiceId)
      : resolveChoice(session, parsed.choiceIndex, input.message);
    if (!selected) {
      return {
        message: '我没认出你选的是哪一个。请回复 1、2、3… 或直接输入公司名。',
        session,
        choices: (session.candidateCases || []).map((item, index) => ({
          id: item.id,
          label: `${index + 1}. ${item.companyName}`,
          sublabel: item.contactEmail,
        })),
      };
    }
    const caseData = input.cases.find((item) => item.id === selected.id);
    if (!caseData) {
      return { message: '这个案件已经不存在了，请重新查询。', session: { mode: 'idle' } };
    }
    if (session.pendingIntent === 'upload_document') {
      return {
        message: `好的，已锁定客户 **${caseData.companyName}**。请上传文件，并说明这是哪类资料（例如 NDA、董事决议、股权架构图）。`,
        session: {
          mode: 'upload_document',
          uploadDraft: { caseId: caseData.id, companyName: caseData.companyName },
        },
        links: [{ href: `/cases/${caseData.id}`, label: `打开 ${caseData.companyName} 案件页` }],
      };
    }
    return {
      message: summarizeCaseProgress(caseData),
      session: { mode: 'idle' },
      links: [{ href: `/cases/${caseData.id}`, label: `进入 ${caseData.companyName}` }],
    };
  }

  if (session.mode === 'create_case') {
    const draft = mergeDraft(session.createCaseDraft || {}, parsed);
    const missing = missingCreateFields(draft);
    if (missing.length) {
      return {
        message: askForMissingFields(draft),
        session: { mode: 'create_case', createCaseDraft: draft },
      };
    }
    if (!input.canCreate) {
      return { message: '你当前账号没有创建 Case 的权限。', session: { mode: 'idle' } };
    }
    return {
      message: `信息已齐，可以创建 **${draft.companyName}** 的 Case。请确认后我会创建并给你案件链接。`,
      session: { mode: 'create_case', createCaseDraft: draft },
      choices: [{ id: 'confirm_create', label: '确认创建 Case' }],
    };
  }

  if (session.mode === 'upload_document') {
    const draft = session.uploadDraft || {};
    if (!draft.caseId) {
      const query = parsed.queryName || parsed.companyName || extractCompanyQuery(input.message);
      if (!query) {
        return {
          message: '请告诉我是哪个客户的资料，例如：「这是 tessst 的 NDA」。也可以先上传文件。',
          session: { mode: 'upload_document', uploadDraft: draft },
        };
      }
      const matches = searchCases(input.cases, query);
      if (!matches.length) {
        return { message: `没有找到名称包含「${query}」的客户。请再确认一下公司名。`, session: { mode: 'idle' } };
      }
      if (matches.length > 1) {
        return disambiguationReply(matches, 'upload_document', `准备为「${query}」补充资料。`);
      }
      return {
        message: `好的，已锁定客户 **${matches[0].companyName}**。请上传文件，并说明文件类型（例如 NDA、董事决议）。`,
        session: {
          mode: 'upload_document',
          uploadDraft: { caseId: matches[0].id, companyName: matches[0].companyName },
        },
        links: [{ href: `/cases/${matches[0].id}`, label: `打开 ${matches[0].companyName}` }],
      };
    }
    return {
      message: `已选中客户 **${draft.companyName}**。请直接上传文件，并在消息里说明文件类型。`,
      session: { mode: 'upload_document', uploadDraft: draft },
      links: [{ href: `/cases/${draft.caseId}`, label: `打开 ${draft.companyName}` }],
    };
  }

  if (parsed.intent === 'help' || parsed.intent === 'unclear') {
    return { message: CAPABILITIES_MESSAGE, session: { mode: 'idle' } };
  }

  if (parsed.intent === 'create_case') {
    if (!input.canCreate) {
      return { message: '你当前账号没有创建 Case 的权限。', session: { mode: 'idle' } };
    }
    const draft = mergeDraft({}, parsed);
    const missing = missingCreateFields(draft);
    if (missing.length) {
      return {
        message: `好的，我来帮你创建新 Case。\n\n${askForMissingFields(draft)}`,
        session: { mode: 'create_case', createCaseDraft: draft },
      };
    }
    return {
      message: `信息已齐，可以创建 **${draft.companyName}** 的 Case。`,
      session: { mode: 'create_case', createCaseDraft: draft },
      choices: [{ id: 'confirm_create', label: '确认创建 Case' }],
    };
  }

  if (parsed.intent === 'query_progress') {
    const query = parsed.queryName || parsed.companyName || extractCompanyQuery(input.message);
    if (!query) {
      return { message: '请告诉我要查哪个客户，例如：「查一下 tessst 的进度」。', session: { mode: 'idle' } };
    }
    const matches = searchCases(input.cases, query);
    if (!matches.length) {
      return { message: `没有找到名称包含「${query}」的客户。`, session: { mode: 'idle' } };
    }
    if (matches.length > 1) {
      return disambiguationReply(matches, 'query_progress', `我在查「${query}」的进展。`);
    }
    const caseData = input.cases.find((item) => item.id === matches[0].id);
    if (!caseData) return { message: '案件不存在。', session: { mode: 'idle' } };
    return {
      message: summarizeCaseProgress(caseData),
      session: { mode: 'idle' },
      links: [{ href: `/cases/${caseData.id}`, label: `进入 ${caseData.companyName}` }],
    };
  }

  if (parsed.intent === 'upload_document') {
    const query = parsed.queryName || parsed.companyName || extractCompanyQuery(input.message);
    if (!query) {
      return {
        message: '好的，请上传文件，并说明是哪个客户的什么资料，例如：「这是 tessst 的 NDA」。',
        session: { mode: 'upload_document', uploadDraft: {} },
      };
    }
    const matches = searchCases(input.cases, query);
    if (!matches.length) {
      return { message: `没有找到名称包含「${query}」的客户。`, session: { mode: 'idle' } };
    }
    if (matches.length > 1) {
      return disambiguationReply(matches, 'upload_document', `准备为「${query}」补充资料。`);
    }
    return {
      message: `好的，已锁定客户 **${matches[0].companyName}**。请上传文件，并说明文件类型。`,
      session: {
        mode: 'upload_document',
        uploadDraft: { caseId: matches[0].id, companyName: matches[0].companyName },
      },
      links: [{ href: `/cases/${matches[0].id}`, label: `打开 ${matches[0].companyName}` }],
    };
  }

  return { message: CAPABILITIES_MESSAGE, session: { mode: 'idle' } };
}

export async function handleAssistantUpload(input: {
  message: string;
  session: AssistantSession;
  cases: KYCCase[];
  filename: string;
  upload: (caseId: string, requirementId: string, requirementName: string) => Promise<KYCCase | undefined>;
}): Promise<AssistantReply> {
  const session = input.session?.mode === 'upload_document'
    ? input.session
    : { mode: 'upload_document' as const, uploadDraft: {} };

  let caseId = session.uploadDraft?.caseId;
  let companyName = session.uploadDraft?.companyName;
  const parsed = await parseAssistantInput(input.message, session);

  if (!caseId) {
    const query = parsed.queryName || parsed.companyName || extractCompanyQuery(input.message);
    if (!query) {
      return {
        message: '上传前请先说明是哪个客户的资料，例如：「这是 tessst 的 NDA」。',
        session: { mode: 'upload_document', uploadDraft: {} },
      };
    }
    const matches = searchCases(input.cases, query);
    if (!matches.length) {
      return { message: `没有找到名称包含「${query}」的客户。`, session: { mode: 'idle' } };
    }
    if (matches.length > 1) {
      return disambiguationReply(matches, 'upload_document', `准备上传「${input.filename}」。`);
    }
    caseId = matches[0].id;
    companyName = matches[0].companyName;
  }

  const caseData = input.cases.find((item) => item.id === caseId);
  if (!caseData) {
    return { message: '案件不存在，请重新选择客户。', session: { mode: 'idle' } };
  }

  const checklist = caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData);
  const checklistName = new Map(checklist.map((item) => [item.id, item.name]));
  const hint = `${parsed.documentHint || ''} ${input.message}`.trim();
  const classification = classifyDocumentHint(hint, input.filename, caseData);
  if (!classification) {
    return {
      message: `已识别客户 **${companyName || caseData.companyName}**，但还没法判断「${input.filename}」属于哪类 checklist 文件。\n\n请补充说明，例如：NDA、董事决议、授权书、股权架构图。`,
      session: {
        mode: 'upload_document',
        uploadDraft: { caseId: caseData.id, companyName: caseData.companyName },
      },
      links: [{ href: `/cases/${caseData.id}`, label: `打开 ${caseData.companyName}` }],
    };
  }

  const updated = await input.upload(caseData.id, classification.requirementId, checklistName.get(classification.requirementId) || classification.requirementId);
  if (!updated) {
    return { message: '上传失败，请稍后再试。', session: { mode: 'idle' } };
  }

  return {
    message: `已把 **${input.filename}** 记到 **${caseData.companyName}** 的「${checklistName.get(classification.requirementId) || classification.requirementId}」。\n\n文件已上传到 Drive，并更新了客户已收文件（与手动上传 / 邮件 fetch 一致）。`,
    session: { mode: 'idle' },
    links: [{ href: `/cases/${caseData.id}`, label: `查看 ${caseData.companyName}` }],
  };
}
