import { classifyAttachmentFilename } from './attachmentClassification';
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

export function ingestDemoMailbox(caseData: KYCCase): EmailIngestionSummary {
  const checklist = caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData);
  const allowedRequirementIds = new Set(checklist.map((doc) => doc.id));
  const existingRequirementIds = new Set(caseData.receivedDocuments.map((doc) => doc.requirementId));
  const imported: ReceivedDocument[] = [];
  const skippedDuplicates: string[] = [];
  const unmatchedAttachments: string[] = [];

  for (const email of getDemoEmails(caseData)) {
    for (const attachment of email.attachments) {
      const match = classifyAttachmentFilename(attachment.filename, allowedRequirementIds);
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
