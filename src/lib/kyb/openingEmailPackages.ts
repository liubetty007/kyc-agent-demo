export type OpeningPackageDefinition = {
  folderName: string;
  description: string;
  defaultSelected: boolean | 'jurisdiction' | 'ns';
  sortOrder: number;
};

export const OPENING_EMAIL_PACKAGE_DEFINITIONS: OpeningPackageDefinition[] = [
  {
    folderName: '01 标准必交文件',
    description: '每次开户默认发送：授权书、开户表、董事决议、NDA 等',
    defaultSelected: true,
    sortOrder: 1,
  },
  {
    folderName: '02 NS Documents',
    description: 'Northstar 业务：NS 董事决议、NS 保密协议',
    defaultSelected: 'ns',
    sortOrder: 2,
  },
  {
    folderName: '03 Hong Kong',
    description: '香港机构补充文件（如 Non-US 确认书等）',
    defaultSelected: 'jurisdiction',
    sortOrder: 3,
  },
  {
    folderName: '04 Singapore',
    description: '新加坡机构补充文件',
    defaultSelected: 'jurisdiction',
    sortOrder: 4,
  },
  {
    folderName: '05 United States',
    description: '美国各州机构补充文件',
    defaultSelected: 'jurisdiction',
    sortOrder: 5,
  },
  {
    folderName: '06 Others',
    description: '其他地区或通用补充文件',
    defaultSelected: false,
    sortOrder: 6,
  },
];

export function normalizePackageName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim();
}

function jurisdictionAliases(jurisdiction: string): string[] {
  const normalized = normalizePackageName(jurisdiction);
  const aliases: Record<string, string[]> = {
    'hong kong': ['hong kong', 'hk', '香港', '03 hong kong'],
    singapore: ['singapore', 'sg', '新加坡', '04 singapore'],
    'united states': ['united states', 'united states of america', 'usa', 'us', '美国', '美國', '05 united states'],
  };
  return aliases[normalized] || [normalized];
}

export function packageDefinitionForFolder(folderName: string): OpeningPackageDefinition | undefined {
  const normalized = normalizePackageName(folderName);
  return OPENING_EMAIL_PACKAGE_DEFINITIONS.find((item) => normalizePackageName(item.folderName) === normalized)
    || OPENING_EMAIL_PACKAGE_DEFINITIONS.find((item) => normalized.includes(normalizePackageName(item.folderName).replace(/^\d+\s*/, '')));
}

export function packageDefaultSelected(
  folderName: string,
  caseData?: { jurisdiction?: string; needsNsBusiness?: boolean },
): boolean {
  const definition = packageDefinitionForFolder(folderName);
  if (!definition) return false;
  if (definition.defaultSelected === true) return true;
  if (definition.defaultSelected === 'ns') return Boolean(caseData?.needsNsBusiness);
  if (definition.defaultSelected === 'jurisdiction') {
    if (!caseData?.jurisdiction) return false;
    const folderNorm = normalizePackageName(folderName);
    return jurisdictionAliases(caseData.jurisdiction).some((alias) => folderNorm.includes(alias) || alias.includes(folderNorm.replace(/^\d+\s*/, '')));
  }
  return false;
}

export function packageDescription(folderName: string): string {
  return packageDefinitionForFolder(folderName)?.description || '按地区或场景选择的开户附件包';
}
