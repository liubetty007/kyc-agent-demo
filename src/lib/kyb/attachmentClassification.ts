export type AttachmentClassification = {
  requirementId: string;
  confidence: number;
  reason: string;
};

export function normalizeAttachmentFilename(filename: string): string {
  return filename.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const filenameAliases: Array<{ requirementId: string; confidence: number; patterns: RegExp[] }> = [
  {
    requirementId: 'board_resolution',
    confidence: 0.94,
    patterns: [/\bns br\b/i, /\bns_br\b/i, /\bbr fake\b/i],
  },
  {
    requirementId: 'mutual_nda',
    confidence: 0.94,
    patterns: [/\bns nda\b/i, /\bns_nda\b/i, /\bnda fake\b/i],
  },
];

export const attachmentClassificationRules: Array<{ requirementId: string; confidence: number; keywords: string[] }> = [
  { requirementId: 'certificate_of_incorporation', confidence: 0.96, keywords: ['coi', 'certificate of incorporation', 'incorporation'] },
  { requirementId: 'certificate_of_incumbency', confidence: 0.94, keywords: ['certificate of incumbency', 'incumbency'] },
  { requirementId: 'certificate_of_change_of_name', confidence: 0.92, keywords: ['change of name', 'changed name', 'certificate of change of name', 'formerly known'] },
  { requirementId: 'business_registration_certificate', confidence: 0.92, keywords: ['business registration', 'br certificate'] },
  { requirementId: 'llc_operating_agreement', confidence: 0.92, keywords: ['llc operating agreement', 'limited liability company agreement', 'operating agreement'] },
  { requirementId: 'memorandum_of_association', confidence: 0.92, keywords: ['memorandum of association', 'moa'] },
  { requirementId: 'corporation_bylaws', confidence: 0.9, keywords: ['bylaws', 'by laws', 'corporate bylaws'] },
  { requirementId: 'limited_partnership_agreement', confidence: 0.92, keywords: ['limited partnership agreement', 'partnership agreement'] },
  { requirementId: 'investment_manager_advisor_agreement', confidence: 0.9, keywords: ['investment manager agreement', 'investment advisor agreement', 'investment adviser agreement'] },
  { requirementId: 'administrator_agreement', confidence: 0.9, keywords: ['administrator agreement', 'administration agreement'] },
  { requirementId: 'fund_certificate_of_incumbency', confidence: 0.92, keywords: ['fund certificate of incumbency', 'spc incumbency'] },
  { requirementId: 'fund_management_agreement', confidence: 0.9, keywords: ['fund management agreement', 'management agreement'] },
  { requirementId: 'trust_deed', confidence: 0.92, keywords: ['trust deed', 'deed of trust'] },
  { requirementId: 'articles_of_association', confidence: 0.92, keywords: ['articles of association', 'aoa', 'memorandum'] },
  { requirementId: 'register_of_directors', confidence: 0.95, keywords: ['register of directors', 'directors'] },
  { requirementId: 'register_of_shareholders', confidence: 0.94, keywords: ['register of shareholders', 'shareholders'] },
  { requirementId: 'ownership_structure_chart', confidence: 0.9, keywords: ['ownership chart', 'ownership structure', 'structure chart'] },
  { requirementId: 'business_description', confidence: 0.86, keywords: ['business description', 'business profile'] },
  { requirementId: 'source_of_funds', confidence: 0.9, keywords: ['source of funds', 'source of fund', 'sof'] },
  { requirementId: 'non_us_person_non_solicitation_hk_confirmation', confidence: 0.9, keywords: ['non-us', 'non solicitation', 'hk confirmation'] },
  { requirementId: 'hk_nnc1_or_nar1', confidence: 0.92, keywords: ['nnc1', 'nar1', 'annual return'] },
  { requirementId: 'hk_nd2a_director_change', confidence: 0.9, keywords: ['nd2a', 'director change', 'director update'] },
  { requirementId: 'institution_onboarding_form', confidence: 0.9, keywords: ['onboarding form', 'institution onboarding'] },
  { requirementId: 'authorization_letter', confidence: 0.9, keywords: ['authorization letter', 'authorisation letter'] },
  { requirementId: 'mutual_nda', confidence: 0.9, keywords: ['nda', 'non disclosure', 'mutual nda', 'mutual non disclosure'] },
  { requirementId: 'board_resolution', confidence: 0.9, keywords: ['board resolution', 'resolution', 'ns br', 'director resolution'] },
  { requirementId: 'declaration_source_of_fund_wealth', confidence: 0.9, keywords: ['source of wealth', 'fund wealth declaration'] },
  { requirementId: 'online_identity_verification', confidence: 0.88, keywords: ['identity verification', 'online verification'] },
  { requirementId: 'passport_or_id', confidence: 0.95, keywords: ['passport', 'national id', 'id card'] },
  { requirementId: 'proof_of_current_residential_address', confidence: 0.95, keywords: ['address proof', 'proof of address', 'utility bill', 'bank statement address'] },
  { requirementId: 'source_of_crypto_assets', confidence: 0.92, keywords: ['source of crypto', 'exchange statement', 'transaction history', 'custodian statement'] },
  { requirementId: 'aml_questionnaire', confidence: 0.9, keywords: ['aml questionnaire', 'aml form'] },
  { requirementId: 'letter_of_undertaking', confidence: 0.9, keywords: ['letter of undertaking', 'undertaking letter'] },
  { requirementId: 'initial_source_of_funds_evidence', confidence: 0.9, keywords: ['initial source of funds', 'initial sof', 'source of funds evidence'] },
  { requirementId: 'ongoing_source_of_funds_evidence', confidence: 0.9, keywords: ['ongoing source of funds', 'ongoing sof'] },
  { requirementId: 'initial_and_ongoing_sof_explanation', confidence: 0.88, keywords: ['sof explanation', 'source of funds explanation', 'ongoing funds explanation'] },
  { requirementId: 'associated_individual_background_profile', confidence: 0.88, keywords: ['background profile', 'individual profile', 'education background', 'industry experience'] },
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

export function classifyAttachmentFilename(
  filename: string,
  allowedRequirementIds: Set<string>,
): AttachmentClassification | null {
  const normalized = normalizeAttachmentFilename(filename);

  for (const alias of filenameAliases) {
    if (!allowedRequirementIds.has(alias.requirementId)) continue;
    if (alias.patterns.some((pattern) => pattern.test(normalized) || pattern.test(filename))) {
      return {
        requirementId: alias.requirementId,
        confidence: alias.confidence,
        reason: `Filename matched alias for ${alias.requirementId}.`,
      };
    }
  }

  const rule = attachmentClassificationRules.find(
    (entry) => allowedRequirementIds.has(entry.requirementId) && entry.keywords.some((keyword) => normalized.includes(keyword)),
  );
  if (!rule) return null;

  return {
    requirementId: rule.requirementId,
    confidence: rule.confidence,
    reason: `Filename matched ${rule.requirementId}.`,
  };
}
