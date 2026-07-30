import { generateChecklist } from './checklist';
import type { DocumentRequirement, KYCCase } from './types';
import { classifyTemplateDocumentSlug } from './templateDocumentCatalog';

export type OpeningChecklistDelivery = 'template_attachment' | 'client_prepared' | 'process_step';

export type OpeningEmailChecklistItem = {
  id: string;
  name: string;
  category: string;
  required: boolean;
  requirementType?: DocumentRequirement['requirementType'];
  reason: string;
  delivery: OpeningChecklistDelivery;
  section: 'required' | 'conditional' | 'supporting';
  templateAttachmentName?: string;
};

const TEMPLATE_REQUIREMENT_IDS = new Set([
  'institution_onboarding_form',
  'authorization_letter',
  'board_resolution',
  'mutual_nda',
  'declaration_source_of_fund_wealth',
  'source_of_funds',
  'non_us_person_non_solicitation_hk_confirmation',
  'board_resolution_ns',
  'mutual_nda_ns',
]);

const PROCESS_STEP_IDS = new Set(['online_identity_verification']);

const SLUG_TO_REQUIREMENT: Record<string, string> = {
  institution_onboarding_form: 'institution_onboarding_form',
  authorization_letter: 'authorization_letter',
  board_resolution: 'board_resolution',
  mutual_nda: 'mutual_nda',
  source_of_funds: 'source_of_funds',
  board_resolution_ns: 'board_resolution_ns',
  mutual_nda_ns: 'mutual_nda_ns',
  non_us_person_hk_confirmation: 'non_us_person_non_solicitation_hk_confirmation',
};

const NS_CHECKLIST_ITEMS: DocumentRequirement[] = [
  {
    id: 'board_resolution_ns',
    name: 'Board Resolution (Northstar)',
    category: 'NS',
    required: true,
    reason: 'Required when Northstar business is enabled.',
  },
  {
    id: 'mutual_nda_ns',
    name: 'Mutual NDA (Northstar)',
    category: 'NS',
    required: true,
    reason: 'Required when Northstar business is enabled.',
  },
];

function checklistSection(
  item: Pick<DocumentRequirement, 'required' | 'requirementType'>,
): OpeningEmailChecklistItem['section'] {
  if (!item.required || item.requirementType === 'supporting') return 'supporting';
  if (item.requirementType === 'conditional_required') return 'conditional';
  return 'required';
}

function deliveryForRequirement(
  requirementId: string,
  templateByRequirement: Map<string, string>,
): OpeningChecklistDelivery {
  if (PROCESS_STEP_IDS.has(requirementId)) return 'process_step';
  if (TEMPLATE_REQUIREMENT_IDS.has(requirementId) || templateByRequirement.has(requirementId)) {
    return 'template_attachment';
  }
  return 'client_prepared';
}

function baseChecklist(caseData: KYCCase): DocumentRequirement[] {
  const items = [...generateChecklist(caseData)];
  if (caseData.needsNsBusiness) {
    for (const item of NS_CHECKLIST_ITEMS) {
      if (!items.some((existing) => existing.id === item.id)) items.push(item);
    }
  }
  return items;
}

function templateAttachmentMap(attachments: { name: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const attachment of attachments) {
    const slug = classifyTemplateDocumentSlug(attachment.name, '');
    const requirementId = SLUG_TO_REQUIREMENT[slug];
    if (!requirementId || map.has(requirementId)) continue;
    map.set(requirementId, attachment.name);
  }
  if (map.has('source_of_funds') && !map.has('declaration_source_of_fund_wealth')) {
    map.set('declaration_source_of_fund_wealth', map.get('source_of_funds')!);
  }
  return map;
}

export function buildOpeningEmailChecklist(
  caseData: KYCCase,
  availableAttachments: { name: string }[] = [],
): OpeningEmailChecklistItem[] {
  const templateByRequirement = templateAttachmentMap(availableAttachments);

  return baseChecklist(caseData)
    .map((item) => {
      const delivery = deliveryForRequirement(item.id, templateByRequirement);
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        required: item.required,
        requirementType: item.requirementType,
        reason: item.reason,
        delivery,
        section: checklistSection(item),
        templateAttachmentName: templateByRequirement.get(item.id),
      };
    })
    .sort((a, b) => {
      const sectionOrder = { required: 0, conditional: 1, supporting: 2 };
      if (sectionOrder[a.section] !== sectionOrder[b.section]) {
        return sectionOrder[a.section] - sectionOrder[b.section];
      }
      if (a.required !== b.required) return a.required ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function deliveryLabel(item: OpeningEmailChecklistItem, language?: KYCCase['language']): string {
  if (language === 'zh') {
    if (item.delivery === 'template_attachment') return item.templateAttachmentName ? '邮件附件（模板）' : '邮件附件（模板，待选）';
    if (item.delivery === 'process_step') return '流程步骤（非上传文件）';
    return '客户自备并回传';
  }
  if (item.delivery === 'template_attachment') {
    return item.templateAttachmentName ? 'Email attachment (template)' : 'Email attachment (template, not selected yet)';
  }
  if (item.delivery === 'process_step') return 'Process step (not an upload)';
  return 'Client to prepare and return';
}

function sectionHeading(section: OpeningEmailChecklistItem['section'], language?: KYCCase['language']): string {
  if (language === 'zh') {
    if (section === 'required') return '必缴文件';
    if (section === 'conditional') return '条件适用时必缴';
    return 'Supporting Documents（辅助文件）';
  }
  if (section === 'required') return 'Required Documents';
  if (section === 'conditional') return 'Conditional Required Documents';
  return 'Supporting Documents';
}

export function formatOpeningEmailChecklist(caseData: KYCCase, attachments: { name: string }[] = []): string {
  const items = buildOpeningEmailChecklist(caseData, attachments);
  const language = caseData.language || 'zh';
  const lines: string[] = [];
  let currentSection: OpeningEmailChecklistItem['section'] | null = null;

  for (const item of items) {
    if (item.section !== currentSection) {
      currentSection = item.section;
      lines.push('', sectionHeading(currentSection, language));
    }
    const marker = item.required ? '✓' : '○';
    lines.push(`- ${item.name} ${marker}（${deliveryLabel(item, language)}）`);
  }

  return lines.join('\n').trim();
}

export function openingChecklistSectionLabel(
  section: OpeningEmailChecklistItem['section'],
  language?: KYCCase['language'],
): string {
  return sectionHeading(section, language);
}

export function openingChecklistDeliveryLabel(
  item: OpeningEmailChecklistItem,
  language?: KYCCase['language'],
): string {
  return deliveryLabel(item, language);
}
