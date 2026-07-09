import type { CaseLanguage } from './types';

export const TEMPLATE_LOCALE_FOLDERS = ['EN', 'ZH'] as const;
export type TemplateLocaleFolder = (typeof TEMPLATE_LOCALE_FOLDERS)[number];

const SLUG_LABELS: Record<string, { en: string; zh: string }> = {
  authorization_letter: { en: 'Authorization Letter', zh: '授权书' },
  institution_onboarding_form: { en: 'Institution Onboarding Form', zh: '机构开户申请表' },
  board_resolution: { en: 'Board Resolution', zh: '董事决议书' },
  mutual_nda: { en: 'Mutual NDA', zh: '保密协议' },
  source_of_funds: { en: 'Source of Funds Declaration', zh: '资金来源声明' },
  board_resolution_ns: { en: 'Board Resolution (Northstar)', zh: '董事决议书 (Northstar)' },
  mutual_nda_ns: { en: 'Mutual NDA (Northstar)', zh: '保密协议 (Northstar)' },
  non_us_person_hk_confirmation: { en: 'Non-US Person HK Confirmation', zh: '香港 Non-US 确认书' },
  sg_acra_profile: { en: 'Singapore ACRA Profile', zh: '新加坡 ACRA 资料' },
  sg_board_authorization_guide: { en: 'Singapore Board Authorization Guide', zh: '新加坡董事授权说明' },
  us_state_registration_checklist: { en: 'US State Registration Checklist', zh: '美国州注册清单' },
  us_w9_request: { en: 'US W-9 Request', zh: '美国 W-9 表格' },
};

export function templateLocaleFolder(language?: CaseLanguage): TemplateLocaleFolder {
  return language === 'zh' ? 'ZH' : 'EN';
}

export function detectTemplateLocale(filename: string): TemplateLocaleFolder {
  if (/[\u4e00-\u9fff]/.test(filename)) return 'ZH';
  if (/授權|機構|董事|保密|资金来源|資金|開戶|开户/.test(filename)) return 'ZH';
  return 'EN';
}

export function classifyTemplateDocumentSlug(filename: string, packageName: string): string {
  const normalized = filename.toLowerCase().replace(/[_-]+/g, ' ');
  const packageNorm = packageName.toLowerCase();

  if (packageNorm.includes('ns documents') || /\bns[_\s-]?(br|nda)\b/.test(normalized) || normalized.includes('northstar')) {
    if (normalized.includes('nda') || normalized.includes('保密')) return 'mutual_nda_ns';
    if (normalized.includes('board') || normalized.includes('br') || normalized.includes('董事')) return 'board_resolution_ns';
  }
  if (normalized.includes('onboarding') || filename.includes('開戶') || filename.includes('开户')) return 'institution_onboarding_form';
  if (normalized.includes('board resolution') || filename.includes('董事決議') || filename.includes('董事决议')) return 'board_resolution';
  if (normalized.includes('nda') || normalized.includes('mutual') || filename.includes('保密')) return 'mutual_nda';
  if (normalized.includes('source of funds') || filename.includes('資金') || filename.includes('资金')) return 'source_of_funds';
  if (normalized.includes('non-us') || normalized.includes('non us') || normalized.includes('hk confirmation')) return 'non_us_person_hk_confirmation';
  if (normalized.includes('acra')) return 'sg_acra_profile';
  if (normalized.includes('board authorization')) return 'sg_board_authorization_guide';
  if (normalized.includes('authorization') || filename.includes('授權') || filename.includes('授权')) return 'authorization_letter';
  if (normalized.includes('registration checklist') || (normalized.includes('state') && packageNorm.includes('united states'))) {
    return 'us_state_registration_checklist';
  }
  if (normalized.includes('w9') || normalized.includes('w 9')) return 'us_w9_request';

  return filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'document';
}

export function templateDocumentLabel(slug: string, language?: CaseLanguage): string {
  const labels = SLUG_LABELS[slug];
  if (!labels) return slug.replace(/_/g, ' ');
  return language === 'zh' ? labels.zh : labels.en;
}

export function matchesLocaleFolderName(folderName: string, locale: TemplateLocaleFolder): boolean {
  const normalized = folderName.trim().toUpperCase();
  if (locale === 'EN') return normalized === 'EN' || normalized === 'ENGLISH' || normalized === '英文';
  return normalized === 'ZH' || normalized === 'CN' || normalized === 'CHINESE' || normalized === '中文';
}
