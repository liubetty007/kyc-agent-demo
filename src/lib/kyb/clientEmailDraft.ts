import type { KYCCase } from './types';
import { followUpAttachmentNote, followUpTemplateIdsForMissingDocs } from './followUpAttachments';
import { openingEmailSubject } from './caseMailThreads';
import { formatDocTypeLabel } from './complianceSubmit';
import { runReview } from './review';
import type { BackendChecklist, BackendDocument } from '@/lib/kyc-backend/client';

export type ClientFollowUpSummary = {
  receivedFromClient: Array<{ label: string; filename?: string }>;
  accepted: string[];
  missing: string[];
  needsRevision: Array<{ label: string; note?: string }>;
  pendingReview: string[];
  neededDocTypes: string[];
  acceptedDocTypes: string[];
  rejectedDocTypes: string[];
};

function buildSummarySection(title: string, lines: string[]): string[] {
  if (!lines.length) return [];
  return [title, ...lines.map((line) => `- ${line}`), ''];
}

export function buildClientFollowUpSummaryFromBackend(
  checklist: BackendChecklist,
  documents: BackendDocument[],
): ClientFollowUpSummary {
  const receivedFromClient = documents.map((doc) => ({
    label: doc.doc_type ? formatDocTypeLabel(doc.doc_type) : 'Unclassified document',
    filename: doc.filename,
  }));

  const accepted = documents
    .filter((doc) => doc.review.status === 'accepted')
    .map((doc) => {
      const label = doc.doc_type ? formatDocTypeLabel(doc.doc_type) : doc.filename;
      return doc.doc_type && doc.filename !== label ? `${label} (${doc.filename})` : label;
    });

  if (!accepted.length) {
    accepted.push(...checklist.received_doc_types.map(formatDocTypeLabel));
  }

  const missing = checklist.missing_required.map(formatDocTypeLabel);

  const needsRevision = documents
    .filter((doc) => doc.review.status === 'rejected')
    .map((doc) => ({
      label: doc.doc_type ? formatDocTypeLabel(doc.doc_type) : doc.filename,
      note: doc.review.note?.trim() || undefined,
    }));

  const pendingReview = checklist.pending_doc_types
    .filter((docType) => !checklist.received_doc_types.includes(docType))
    .map(formatDocTypeLabel);

  const neededDocTypes = [
    ...checklist.missing_required,
    ...documents.filter((doc) => doc.review.status === 'rejected' && doc.doc_type).map((doc) => doc.doc_type as string),
  ];
  const rejectedDocTypes = documents
    .filter((doc) => doc.review.status === 'rejected' && doc.doc_type)
    .map((doc) => doc.doc_type as string);

  return {
    receivedFromClient,
    accepted: [...new Set(accepted)],
    missing: [...new Set(missing)],
    needsRevision,
    pendingReview: [...new Set(pendingReview)],
    neededDocTypes: [...new Set(neededDocTypes)],
    acceptedDocTypes: [...checklist.received_doc_types],
    rejectedDocTypes: [...new Set(rejectedDocTypes)],
  };
}

export function buildClientFollowUpSummaryFromLocal(caseData: KYCCase): ClientFollowUpSummary {
  const review = caseData.review || runReview(caseData);
  const checklist = caseData.checklist || [];
  const checklistName = new Map(checklist.map((item) => [item.id, item.name]));

  const receivedFromClient = caseData.receivedDocuments.map((doc) => ({
    label: checklistName.get(doc.requirementId) || doc.name,
    filename: doc.name,
  }));

  const accepted = caseData.receivedDocuments
    .filter((doc) => doc.status === 'accepted')
    .map((doc) => checklistName.get(doc.requirementId) || doc.name);

  const missing = review.missingDocuments.map((doc) => doc.name);

  const needsRevision = caseData.receivedDocuments
    .filter((doc) => doc.status === 'invalid' || doc.status === 'needs_review')
    .map((doc) => ({
      label: checklistName.get(doc.requirementId) || doc.name,
      note: doc.status === 'needs_review' ? 'Pending review' : 'Revision requested',
    }));

  const neededDocTypes = [
    ...review.missingDocuments.map((doc) => doc.id),
    ...caseData.receivedDocuments
      .filter((doc) => doc.status === 'invalid')
      .map((doc) => doc.requirementId),
  ];
  const acceptedDocTypes = caseData.receivedDocuments
    .filter((doc) => doc.status === 'accepted')
    .map((doc) => doc.requirementId);
  const rejectedDocTypes = caseData.receivedDocuments
    .filter((doc) => doc.status === 'invalid')
    .map((doc) => doc.requirementId);

  return {
    receivedFromClient,
    accepted,
    missing,
    needsRevision,
    pendingReview: [],
    neededDocTypes: [...new Set(neededDocTypes)],
    acceptedDocTypes: [...new Set(acceptedDocTypes)],
    rejectedDocTypes: [...new Set(rejectedDocTypes)],
  };
}

export function buildClientFollowUpEmailDraft(caseData: KYCCase, summary: ClientFollowUpSummary): string {
  const subject = openingEmailSubject(caseData);

  const receivedLines = summary.receivedFromClient.map((item) =>
    item.filename && item.filename !== item.label ? `${item.label} (${item.filename})` : item.label,
  );

  const revisionLines = summary.needsRevision.map((item) =>
    item.note ? `${item.label}: ${item.note}` : `${item.label}: please revise and resubmit`,
  );

  if (caseData.language === 'zh') {
    const bodyParts = [
      `尊敬的 ${caseData.companyName} 团队：`,
      '',
      '感谢您的回复。我们已初步查看您提交的文件。',
      '',
      ...buildSummarySection('已收到的文件：', receivedLines),
      ...buildSummarySection('已接受的文件：', summary.accepted),
      ...buildSummarySection('仍需补充的文件：', summary.missing),
      ...buildSummarySection('需修改后重新提交的文件：', revisionLines),
      ...buildSummarySection('仍在审核中的文件：', summary.pendingReview),
    ];

    const stillNeeded = summary.missing.length + summary.needsRevision.length;
    if (stillNeeded > 0) {
      const templateIds = followUpTemplateIdsForMissingDocs(caseData, {
        neededDocTypes: summary.neededDocTypes,
        acceptedDocTypes: summary.acceptedDocTypes,
        rejectedDocTypes: summary.rejectedDocTypes,
      });
      const attachmentNote = followUpAttachmentNote(templateIds, caseData.language);
      if (attachmentNote) bodyParts.push(attachmentNote);
      bodyParts.push('请在本邮件线程中回复并提交缺失或修订后的文件；如适用，请优先提供 PDF 版本。', '');
    } else if (summary.pendingReview.length > 0) {
      bodyParts.push('剩余文件审核完成后，我们会继续跟进。', '');
    } else {
      bodyParts.push('现阶段暂不需要进一步补充文件，我们会继续处理贵司申请。', '');
    }

    bodyParts.push('此致，', 'KYC Team');
    return `Subject: ${subject}\n\n${bodyParts.join('\n')}`;
  }

  const bodyParts = [
    `Dear ${caseData.companyName} Team,`,
    '',
    'Thank you for your reply. We have reviewed the documents you sent.',
    '',
    ...buildSummarySection('Documents received from your reply:', receivedLines),
    ...buildSummarySection('Documents accepted:', summary.accepted),
    ...buildSummarySection('Documents still required:', summary.missing),
    ...buildSummarySection('Documents requiring revision:', revisionLines),
    ...buildSummarySection('Documents still under review:', summary.pendingReview),
  ];

  const stillNeeded = summary.missing.length + summary.needsRevision.length;
  if (stillNeeded > 0) {
    const templateIds = followUpTemplateIdsForMissingDocs(caseData, {
      neededDocTypes: summary.neededDocTypes,
      acceptedDocTypes: summary.acceptedDocTypes,
      rejectedDocTypes: summary.rejectedDocTypes,
    });
    const attachmentNote = followUpAttachmentNote(templateIds, caseData.language);
    if (attachmentNote) bodyParts.push(attachmentNote);
    bodyParts.push(
      'Please reply to this email thread with the missing or revised documents in PDF format where applicable.',
      '',
    );
  } else if (summary.pendingReview.length > 0) {
    bodyParts.push('We will follow up once the remaining documents finish review.', '');
  } else {
    bodyParts.push('No further documents are required at this stage. We will continue processing your application.', '');
  }

  bodyParts.push('Best regards,', 'KYC Team');

  const body = bodyParts.join('\n');
  return `Subject: ${subject}\n\n${body}`;
}
