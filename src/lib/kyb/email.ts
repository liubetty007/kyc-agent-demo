import type { KYCCase, ReviewResult } from './types';

export function generateEmailDraft(caseData: KYCCase, review: ReviewResult): string {
  const missingItems = review.questionsForClient.length
    ? review.questionsForClient.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : 'No additional documents are required at this stage.';

  const conditionalNotes: string[] = [];
  if (review.businessAssessment.cryptoRelated) {
    conditionalNotes.push(
      'As your business involves crypto assets, please provide supporting evidence for the source of funds / source of crypto assets. This may include exchange statements, custodian statements, transaction history, wallet addresses, audited financial statements, financing documents, or other evidence that supports the origin of the assets.',
    );
  }
  if (review.businessAssessment.miningRelated) {
    conditionalNotes.push(
      'As your business involves crypto mining, please provide mining proof, such as an Antpool Observer Link or equivalent mining pool observer link, mining pool account evidence, mining revenue records, or other supporting evidence showing the source of mining proceeds.',
    );
  }
  if (review.businessAssessment.financingSourceDetected) {
    conditionalNotes.push(
      'As the source of funds is described as financing, please provide supporting evidence, including the financing agreement, investor/lender information, and proof of fund transfer showing the source and movement of funds.',
    );
  }
  if (caseData.jurisdiction === 'Hong Kong') {
    conditionalNotes.push('As the company is registered in Hong Kong, please also provide the Non-US Person & Non-solicitation in HK Confirmation.');
  }

  return `Subject: Additional Documents Required – Corporate Account Opening\n\nDear ${caseData.companyName} Team,\n\nThank you for providing the onboarding documents.\n\nAfter our initial review, we noted that the following documents or clarifications are still required:\n\n${missingItems}\n\n${conditionalNotes.join('\n\n')}\n\nPlease provide clear and complete copies in PDF format where applicable.\n\nBest regards,\nKYC Team`;
}
