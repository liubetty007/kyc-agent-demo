export type StandardDriveTemplate = {
  templateId: string;
  driveFileId: string;
  displayName: string;
  packageName: string;
  defaultSelected: boolean;
};

export const STANDARD_DRIVE_TEMPLATES: StandardDriveTemplate[] = [
  {
    templateId: 'authorization_letter.pdf',
    driveFileId: '1iQ5OmHhiUl4OrF_cUUHIl_NEqnAPVky1',
    displayName: 'Authorization Letter / 授权书',
    packageName: 'KYC标准文件',
    defaultSelected: true,
  },
  {
    templateId: 'institution_kyc_application_form.pdf',
    driveFileId: '1AgJOlBJhSn8qay2Gcrl6U2Z5jUaNnFla',
    displayName: 'Institution Onboarding Form / 機構開戶申請表',
    packageName: 'KYC标准文件',
    defaultSelected: true,
  },
  {
    templateId: 'board_resolution.pdf',
    driveFileId: '1zkmdEmsU0vZPnkusg_sMRf5S17l78YaI',
    displayName: 'Board Resolution Template / 董事決議書模板',
    packageName: 'KYC标准文件',
    defaultSelected: true,
  },
  {
    templateId: 'mutual_confidentiality_agreement_nda.pdf',
    driveFileId: '1eDvSFxD1t1j5bxvohz4qlPvNIAAkLZaX',
    displayName: 'Mutual Confidentiality Agreement (NDA) / 保密協議',
    packageName: 'KYC标准文件',
    defaultSelected: true,
  },
  {
    templateId: 'source_of_funds_template.pdf',
    driveFileId: '1WftNEjEj1vZhhekOSjV_MGC8tP9bQcIq',
    displayName: 'Sample of Declaration of Fund / 資金來源聲明參考範例',
    packageName: 'KYC标准文件',
    defaultSelected: true,
  },
  {
    templateId: 'non_us_person_non_solicitation_hk.pdf',
    driveFileId: '1Un1aLveqvvX4tfGsL7C3K36beHpKlHue',
    displayName: 'Non-US Person & Non-solicitation in HK Confirmation',
    packageName: 'KYC标准文件',
    defaultSelected: false,
  },
  {
    templateId: 'board_resolution_ns.pdf',
    driveFileId: '1KMZmfBIqRklkqB4vUgJ7UJDbOfiQ78kz',
    displayName: 'Board Resolution / 董事決議書 (Northstar)',
    packageName: 'Northstar 附件',
    defaultSelected: false,
  },
  {
    templateId: 'mutual_confidentiality_agreement_nda_ns.pdf',
    driveFileId: '1dMbIdcwFZl8P0lzhjBI-F9G9Q_2DEmVO',
    displayName: 'Mutual Confidentiality Agreement (NDA) / 保密協議 (Northstar)',
    packageName: 'Northstar 附件',
    defaultSelected: false,
  },
];
