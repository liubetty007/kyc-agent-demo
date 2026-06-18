import type { KYCCase } from './types';

export type ComplianceChecklistSnapshot = {
  missing_required: string[];
  missing_recommended: string[];
  pending_doc_types: string[];
  received_doc_types: string[];
};

export function formatDocTypeLabel(docType: string): string {
  return docType.replaceAll('_', ' ');
}

export function localChecklistSnapshot(caseData: KYCCase): ComplianceChecklistSnapshot {
  const checklist = caseData.checklist || [];
  const acceptedIds = new Set(
    caseData.receivedDocuments.filter((doc) => doc.status === 'accepted').map((doc) => doc.requirementId),
  );
  const pendingIds = new Set(
    caseData.receivedDocuments.filter((doc) => doc.status === 'needs_review').map((doc) => doc.requirementId),
  );

  const requiredIds = checklist.filter((item) => item.required).map((item) => item.id);
  const recommendedIds = checklist.filter((item) => !item.required).map((item) => item.id);

  return {
    missing_required: requiredIds.filter((id) => !acceptedIds.has(id)),
    missing_recommended: recommendedIds.filter((id) => !acceptedIds.has(id)),
    pending_doc_types: [...pendingIds],
    received_doc_types: [...acceptedIds],
  };
}

export function canSubmitCaseToCompliance(status: string): boolean {
  return status !== 'approved';
}
