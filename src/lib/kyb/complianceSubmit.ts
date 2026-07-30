import type { KYCCase } from './types';
import { generateChecklist } from './checklist';

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
  return checklistSnapshotFromStatuses(caseData, [], []);
}

export function checklistSnapshotFromStatuses(
  caseData: KYCCase,
  externallyAcceptedIds: string[],
  externallyPendingIds: string[],
): ComplianceChecklistSnapshot {
  const checklist = generateChecklist(caseData);
  const acceptedIds = new Set(
    [
      ...caseData.receivedDocuments.filter((doc) => doc.status === 'accepted').map((doc) => doc.requirementId),
      ...externallyAcceptedIds,
    ],
  );
  const pendingIds = new Set(
    [
      ...caseData.receivedDocuments
        .filter((doc) => doc.status === 'needs_review' || doc.status === 'received')
        .map((doc) => doc.requirementId),
      ...externallyPendingIds,
    ],
  );

  const requiredIds = checklist.filter((item) => item.required).map((item) => item.id);

  return {
    missing_required: requiredIds.filter((id) => !acceptedIds.has(id)),
    missing_recommended: [],
    pending_doc_types: [...pendingIds],
    received_doc_types: [...acceptedIds],
  };
}

export function canSubmitCaseToCompliance(status: string): boolean {
  return status !== 'approved';
}
