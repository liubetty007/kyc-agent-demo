import { generateChecklist } from './checklist';
import type { KYCCase, ReceivedDocument } from './types';

type DemoAttachment = {
  filename: string;
  issueDate?: string;
};

type DemoEmail = {
  from: string;
  subject: string;
  receivedAt: string;
  attachments: DemoAttachment[];
};

export type EmailIngestionSummary = {
  imported: ReceivedDocument[];
  skippedDuplicates: string[];
  unmatchedAttachments: string[];
};

const fallbackEmails: DemoEmail[] = [
  {
    from: 'client@example.com',
    subject: 'KYC documents for Amber Hash Trading Limited',
    receivedAt: '2026-06-07T09:30:00.000Z',
    attachments: [
      { filename: 'Certificate of Incorporation - Amber Hash.pdf' },
      { filename: 'Register of Directors.pdf' },
      { filename: 'Passport - Alex UBO.pdf' },
      { filename: 'Address Proof - Alex UBO.pdf', issueDate: '2026-05-18' },
      { filename: 'Exchange statement and transaction history.pdf' },
    ],
  },
];

const demoEmailsByCase: Record<string, DemoEmail[]> = {
  'KYC-DEMO-HK': fallbackEmails,
  'KYC-DEMO-BVI': [
    {
      from: 'ops@northpool.example',
      subject: 'North Pool Mining Ltd - KYB documents and Antpool proof',
      receivedAt: '2026-06-07T10:15:00.000Z',
      attachments: [
        { filename: 'BVI Certificate of Incorporation.pdf' },
        { filename: 'Source of Funds - Mining Revenue.pdf' },
        { filename: 'Antpool Observer Link - Mining Proof.pdf' },
        { filename: 'Mining revenue evidence.csv' },
        { filename: 'Other documents - wallet addresses if available.xlsx' },
      ],
    },
  ],
};

const classificationRules: Array<{ requirementId: string; confidence: number; keywords: string[] }> = [
  { requirementId: 'certificate_of_incorporation', confidence: 0.96, keywords: ['coi', 'certificate of incorporation', 'incorporation'] },
  { requirementId: 'certificate_of_incumbency', confidence: 0.94, keywords: ['certificate of incumbency', 'incumbency'] },
  { requirementId: 'business_registration_certificate', confidence: 0.92, keywords: ['business registration', 'br certificate'] },
  { requirementId: 'articles_of_association', confidence: 0.92, keywords: ['articles of association', 'aoa', 'memorandum'] },
  { requirementId: 'register_of_directors', confidence: 0.95, keywords: ['register of directors', 'directors'] },
  { requirementId: 'register_of_shareholders', confidence: 0.94, keywords: ['register of shareholders', 'shareholders'] },
  { requirementId: 'ownership_structure_chart', confidence: 0.9, keywords: ['ownership chart', 'ownership structure', 'structure chart'] },
  { requirementId: 'business_description', confidence: 0.86, keywords: ['business description', 'business profile'] },
  { requirementId: 'source_of_funds', confidence: 0.9, keywords: ['source of funds', 'source of fund', 'sof'] },
  { requirementId: 'non_us_person_non_solicitation_hk_confirmation', confidence: 0.9, keywords: ['non-us', 'non solicitation', 'hk confirmation'] },
  { requirementId: 'hk_nnc1_or_nar1', confidence: 0.92, keywords: ['nnc1', 'nar1', 'annual return'] },
  { requirementId: 'institution_onboarding_form', confidence: 0.9, keywords: ['onboarding form', 'institution onboarding'] },
  { requirementId: 'authorization_letter', confidence: 0.9, keywords: ['authorization letter', 'authorisation letter'] },
  { requirementId: 'mutual_nda', confidence: 0.9, keywords: ['nda', 'non disclosure'] },
  { requirementId: 'board_resolution', confidence: 0.9, keywords: ['board resolution', 'resolution'] },
  { requirementId: 'declaration_source_of_fund_wealth', confidence: 0.9, keywords: ['source of wealth', 'fund wealth declaration'] },
  { requirementId: 'online_identity_verification', confidence: 0.88, keywords: ['identity verification', 'online verification'] },
  { requirementId: 'passport_or_id', confidence: 0.95, keywords: ['passport', 'national id', 'id card'] },
  { requirementId: 'proof_of_current_residential_address', confidence: 0.95, keywords: ['address proof', 'proof of address', 'utility bill', 'bank statement address'] },
  { requirementId: 'source_of_crypto_assets', confidence: 0.92, keywords: ['source of crypto', 'exchange statement', 'transaction history', 'custodian statement'] },
  { requirementId: 'aml_questionnaire', confidence: 0.9, keywords: ['aml questionnaire', 'aml form'] },
  { requirementId: 'ubo_no_other_shareholder_declaration', confidence: 0.88, keywords: ['no other shareholders', 'no other shareholder', 'ubo declaration', 'beneficial ownership declaration'] },
  { requirementId: 'ncrs_pep_form', confidence: 0.88, keywords: ['ncrs', 'pep form', 'ncrs pep'] },
  { requirementId: 'worldcheck_news_explanation', confidence: 0.86, keywords: ['worldcheck', 'world check', 'screening explanation', 'news explanation'] },
  { requirementId: 'wallet_address_list', confidence: 0.88, keywords: ['wallet address', 'wallet addresses'] },
  { requirementId: 'mining_proof', confidence: 0.96, keywords: ['antpool', 'mining proof', 'observer link', 'mining pool'] },
  { requirementId: 'mining_revenue_evidence', confidence: 0.9, keywords: ['mining revenue', 'revenue evidence'] },
  { requirementId: 'mining_wallet_address', confidence: 0.86, keywords: ['mining wallet', 'wallet receiving mining'] },
  { requirementId: 'financing_agreement', confidence: 0.93, keywords: ['financing agreement', 'loan agreement'] },
  { requirementId: 'investor_lender_information', confidence: 0.9, keywords: ['investor information', 'lender information'] },
  { requirementId: 'proof_of_fund_transfer', confidence: 0.9, keywords: ['fund transfer', 'transfer proof', 'payment proof'] },
  { requirementId: 'us_de_formation_or_incorporation', confidence: 0.9, keywords: ['formation', 'incorporation document'] },
  { requirementId: 'us_de_good_standing', confidence: 0.94, keywords: ['good standing'] },
  { requirementId: 'us_de_operating_agreement_or_bylaws', confidence: 0.9, keywords: ['operating agreement', 'bylaws', 'by laws'] },
  { requirementId: 'us_de_ein_confirmation_letter', confidence: 0.9, keywords: ['ein', 'irs confirmation'] },
  { requirementId: 'us_wy_articles', confidence: 0.9, keywords: ['wyoming articles', 'articles'] },
  { requirementId: 'us_wy_good_standing', confidence: 0.94, keywords: ['wyoming good standing', 'good standing'] },
  { requirementId: 'us_wy_operating_agreement', confidence: 0.9, keywords: ['operating agreement'] },
  { requirementId: 'us_wy_ein_confirmation_letter', confidence: 0.9, keywords: ['ein', 'irs confirmation'] },
  { requirementId: 'us_wy_certificate_of_incumbency', confidence: 0.9, keywords: ['certificate of incumbency', 'incumbency'] },
  { requirementId: 'us_wy_county_clerk_check', confidence: 0.86, keywords: ['county clerk'] },
  { requirementId: 'us_nv_articles', confidence: 0.9, keywords: ['nevada articles', 'articles'] },
  { requirementId: 'us_nv_certificate_of_existence', confidence: 0.92, keywords: ['certificate of existence'] },
  { requirementId: 'us_nv_business_license', confidence: 0.92, keywords: ['business license'] },
  { requirementId: 'us_nv_operating_agreement', confidence: 0.9, keywords: ['operating agreement'] },
  { requirementId: 'us_ca_articles', confidence: 0.9, keywords: ['california articles', 'articles'] },
  { requirementId: 'us_ca_statement_of_information', confidence: 0.92, keywords: ['statement of information', 'si-550', 'si 550'] },
  { requirementId: 'us_ca_ein_confirmation_letter', confidence: 0.9, keywords: ['ein', 'irs confirmation'] },
  { requirementId: 'us_tx_certificate_of_formation', confidence: 0.92, keywords: ['certificate of formation'] },
  { requirementId: 'us_tx_certificate_of_fact_status', confidence: 0.92, keywords: ['certificate of fact', 'fact status'] },
  { requirementId: 'us_tx_operating_agreement', confidence: 0.9, keywords: ['operating agreement'] },
  { requirementId: 'us_tx_ein_confirmation_letter', confidence: 0.9, keywords: ['ein', 'irs confirmation'] },
  { requirementId: 'us_ny_publication_proof', confidence: 0.9, keywords: ['publication proof', 'newspaper publication'] },
  { requirementId: 'us_dc_basic_business_license', confidence: 0.9, keywords: ['basic business license'] },
];

function getDemoEmails(caseData: KYCCase): DemoEmail[] {
  if (demoEmailsByCase[caseData.id]) return demoEmailsByCase[caseData.id];
  if (caseData.contactEmail) {
    return fallbackEmails.map((email) => ({
      ...email,
      from: caseData.contactEmail || email.from,
      subject: `KYC documents for ${caseData.companyName}`,
    }));
  }
  return fallbackEmails;
}

function classifyAttachment(filename: string, allowedRequirementIds: Set<string>) {
  const normalized = filename.toLowerCase().replace(/[_-]/g, ' ');
  return classificationRules.find((rule) =>
    allowedRequirementIds.has(rule.requirementId) && rule.keywords.some((keyword) => normalized.includes(keyword)),
  );
}

export function ingestDemoMailbox(caseData: KYCCase): EmailIngestionSummary {
  const checklist = caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData);
  const allowedRequirementIds = new Set(checklist.map((doc) => doc.id));
  const existingRequirementIds = new Set(caseData.receivedDocuments.map((doc) => doc.requirementId));
  const imported: ReceivedDocument[] = [];
  const skippedDuplicates: string[] = [];
  const unmatchedAttachments: string[] = [];

  for (const email of getDemoEmails(caseData)) {
    for (const attachment of email.attachments) {
      const match = classifyAttachment(attachment.filename, allowedRequirementIds);
      if (!match) {
        unmatchedAttachments.push(attachment.filename);
        continue;
      }
      if (existingRequirementIds.has(match.requirementId) || imported.some((doc) => doc.requirementId === match.requirementId)) {
        skippedDuplicates.push(attachment.filename);
        continue;
      }
      imported.push({
        id: `${match.requirementId}-email-${Date.now()}-${imported.length}`,
        requirementId: match.requirementId,
        name: attachment.filename,
        status: 'received',
        issueDate: attachment.issueDate,
        notes: `Auto-classified from demo mailbox. Confidence: ${Math.round(match.confidence * 100)}%.`,
        source: 'email_demo',
        fromEmail: email.from,
        emailSubject: email.subject,
        receivedAt: email.receivedAt,
        confidence: match.confidence,
      });
    }
  }

  return { imported, skippedDuplicates, unmatchedAttachments };
}
