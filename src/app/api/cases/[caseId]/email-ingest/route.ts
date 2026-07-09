import { classifyAttachmentFilename } from '@/lib/kyb/attachmentClassification';
import { requireApiUser } from '@/lib/auth/admin';
import { openingThreadId } from '@/lib/kyb/caseMailThreads';
import { ingestDemoMailbox } from '@/lib/kyb/emailIngestion';
import { analyzeEmailForCase } from '@/lib/kyb/emailIntakeAgent';
import {
  getCaseGmailMessage,
  hasGmailConfigured,
  kycMailboxAddress,
  listThreadMessageIds,
  searchCaseMailboxThreadIds,
} from '@/lib/kyb/gmail';
import { appendMailboxMessage, customerEmail, customerEmails, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { generateChecklist } from '@/lib/kyb/checklist';
import { storeCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { ensureCaseDriveFolder } from '@/lib/kyb/driveFolders';
import { getCase, updateCase, upsertReceivedDocument } from '@/lib/kyb/storage';
import type { KYCCase } from '@/lib/kyb/types';
import type { GmailMessage } from '@/lib/kyb/gmail';
import { ingestBackendEmail, ingestBackendEmailMock, isBackendEnabled } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

function demoMockPayload(caseData: { companyName: string; contactEmail?: string }) {
  return {
    from_email: caseData.contactEmail || 'client@example.com',
    subject: `KYC documents for ${caseData.companyName}`,
    attachments: [
      { filename: 'Certificate of Incorporation.pdf', text: 'Certificate of Incorporation' },
      { filename: 'Articles of Association.pdf', text: 'Articles of Association memorandum' },
      { filename: 'Board Resolution.pdf', text: 'Board Resolution directors' },
      { filename: 'Proof of Address - UBO.pdf', text: 'utility bill proof of address bank statement' },
      { filename: 'Mutual Confidentiality Agreement NDA.pdf', text: 'mutual confidentiality agreement nda' },
    ],
  };
}

function backendStatus(error: unknown): number | null {
  const raw = error instanceof Error ? error.message : '';
  const statusMatch = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  return statusMatch ? Number(statusMatch[1]) : null;
}

function isBackendGmailScopeError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error || '');
  return raw.includes('invalid_scope') || raw.includes('Google 授权缺少权限');
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function caseNeedles(caseData: KYCCase): string[] {
  return [caseData.id, caseData.companyName]
    .map((value) => normalize(value || ''))
    .filter((value) => value.length >= 3);
}

function textHasCaseContext(caseData: KYCCase, text: string): boolean {
  const haystack = normalize(text);
  return caseNeedles(caseData).some((needle) => haystack.includes(needle));
}

function messageHasCaseContext(caseData: KYCCase, message: GmailMessage): boolean {
  const attachmentNames = message.attachments.map((attachment) => attachment.filename).join(' ');
  return textHasCaseContext(caseData, `${message.subject}\n${message.body}\n${attachmentNames}`);
}

function messageIsFromContact(caseData: KYCCase, message: GmailMessage): boolean {
  const emails = customerEmails(caseData);
  if (!emails.length) return true;
  return emails.includes(normalizeEmail(message.from));
}

function shouldImportAttachment(caseData: KYCCase, message: GmailMessage, filename: string): boolean {
  const openingThread = openingThreadId(caseData);
  if (openingThread && message.threadId === openingThread) return true;
  return (
    textHasCaseContext(caseData, filename)
    || textHasCaseContext(caseData, `${message.subject}\n${message.body}`)
  );
}

function receivedDocumentNames(caseData: KYCCase): Set<string> {
  return new Set(caseData.receivedDocuments.map((doc) => doc.name.toLowerCase()));
}

async function listCaseThreadGmailMessages(caseData: Awaited<ReturnType<typeof getCase>>) {
  if (!caseData) return [];
  const openingThread = openingThreadId(caseData);
  const threadIds = openingThread ? [openingThread] : await searchCaseMailboxThreadIds(caseData);

  const messages = [];
  const seenIds = new Set<string>();
  for (const threadId of threadIds) {
    const ids = await listThreadMessageIds(threadId);
    for (const id of ids) {
      if (!id || seenIds.has(id)) continue;
      const message = await getCaseGmailMessage(id);
      if (message.threadId !== threadId) continue;
      if (message.labelIds?.includes('SENT') && !message.labelIds.includes('INBOX')) continue;
      if (!messageIsFromContact(caseData, message)) continue;
      const trustedThread = openingThread && message.threadId === openingThread;
      if (!trustedThread && !messageHasCaseContext(caseData, message)) continue;
      seenIds.add(id);
      messages.push(message);
    }
  }
  return messages;
}

function fallbackRequirementId(caseData: KYCCase, filename: string): string | undefined {
  const checklist = caseData.checklist?.length ? caseData.checklist : generateChecklist(caseData);
  const allowed = new Set(checklist.map((item) => item.id));
  return classifyAttachmentFilename(filename, allowed)?.requirementId;
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  if (isBackendEnabled() && isBackendCaseId(caseId)) {
    try {
      const summary = await ingestBackendEmail(caseId);
      return NextResponse.json({ mode: summary.mode, summary });
    } catch (error) {
      if (isBackendGmailScopeError(error)) {
        console.warn('Backend Gmail ingest has invalid OAuth scope; falling back to Next.js Gmail ingest.', error);
      } else if (backendStatus(error) !== 404) {
        const message = error instanceof Error ? error.message : 'Gmail ingest failed';
        return NextResponse.json(
          {
            error: message,
            hint: '请先 Send via Gmail 发开户邮件，等客户回信后再点 Fetch Client Reply。不会自动导入 demo 假文件。',
          },
          { status: 502 },
        );
      }
    }
  }

  if (hasGmailConfigured()) {
    const startingCase = isBackendCaseId(caseId)
      ? ((await updateCase(caseId, { checklist: generateChecklist(caseData) })) || { ...caseData, checklist: generateChecklist(caseData) })
      : caseData;
    const existingProviderIds = new Set((startingCase.mailboxMessages || []).map((message) => message.providerMessageId).filter(Boolean));
    const receivedNames = receivedDocumentNames(startingCase);
    const gmailMessages = (await listCaseThreadGmailMessages(startingCase)).filter((message) => {
      if (!existingProviderIds.has(message.id)) return true;
      return message.attachments.some((attachment) => !receivedNames.has(attachment.filename.toLowerCase()));
    });
    let updated = startingCase;
    const importedDocuments = [];
    const importedMessages = [];
    const skippedAttachments = [];
    const driveFolderId = await ensureCaseDriveFolder(caseId);

    for (const message of gmailMessages) {
      const isRetry = existingProviderIds.has(message.id);
      const pendingAttachments = message.attachments.filter(
        (attachment) => !receivedNames.has(attachment.filename.toLowerCase()),
      );
      if (!pendingAttachments.length) continue;

      const analysis = await analyzeEmailForCase(updated, {
        from: message.from,
        subject: message.subject,
        body: message.body,
        attachments: pendingAttachments.map((attachment) => attachment.filename),
      });

      for (const attachment of pendingAttachments) {
        if (!shouldImportAttachment(updated, message, attachment.filename)) {
          skippedAttachments.push({
            name: attachment.filename,
            reason: 'Attachment is not tied to this case company or case id.',
          });
          continue;
        }
        const attachmentAnalysis = analysis.attachments.find((item) => item.filename === attachment.filename);
        const requirementId = attachmentAnalysis?.suggestedRequirementId || fallbackRequirementId(updated, attachment.filename);
        if (!requirementId) {
          skippedAttachments.push({
            name: attachment.filename,
            reason: 'Could not match attachment to a checklist item.',
          });
          continue;
        }
        const storageObject = await storeCaseDocumentBytes({
          caseId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          data: attachment.data,
          parentFolderId: driveFolderId,
        });
        const doc = {
          id: `${requirementId}-gmail-${message.id}`,
          requirementId,
          name: attachment.filename,
          status: 'received' as const,
          notes: `Imported from Gmail. ${attachmentAnalysis?.reason || 'Matched by filename fallback.'}`,
          source: 'gmail' as const,
          fromEmail: message.from,
          emailSubject: message.subject,
          receivedAt: message.receivedAt,
          confidence: attachmentAnalysis?.confidence || 0.55,
          storageObject,
        };
        const next = await upsertReceivedDocument(caseId, doc);
        if (next) updated = next;
        importedDocuments.push(doc);
        receivedNames.add(attachment.filename.toLowerCase());
      }

      if (!isRetry) {
        const mailboxMessages = appendMailboxMessage(updated, {
          provider: 'gmail',
          providerMessageId: message.id,
          threadId: message.threadId,
          from: message.from,
          to: message.to || kycMailboxAddress(),
          subject: message.subject,
          body: message.body || message.snippet || '',
          direction: 'inbound',
          status: 'received',
          attachments: message.attachments.map((attachment) => attachment.filename),
          analysis,
        });
        updated = (await updateCase(caseId, { mailboxMessages })) || updated;
        importedMessages.push({ id: message.id, subject: message.subject, analysis });
      }
    }

    const refreshedChecklist = generateChecklist(updated);
    updated = (await updateCase(caseId, { checklist: refreshedChecklist })) || updated;

    return NextResponse.json({
      mode: 'gmail',
      case: updated,
      summary: {
        importedMessages: importedMessages.length,
        importedDocuments: importedDocuments.length,
        skippedAttachments,
        messages: importedMessages,
      },
    });
  }

  const summary = ingestDemoMailbox(caseData);
  let updated = caseData;
  for (const doc of summary.imported) {
    const next = await upsertReceivedDocument(caseId, doc);
    if (next) updated = next;
  }

  let mailboxMessages = updated.mailboxMessages || [];
  if (summary.imported.length) {
    mailboxMessages = appendMailboxMessage(updated, {
      from: customerEmail(updated),
      to: KYC_TEAM_EMAIL,
      subject: `KYB documents for ${updated.companyName}`,
      body: 'Please find attached the requested KYB documents for your review.',
      direction: 'inbound',
      status: 'received',
      attachments: summary.imported.map((doc) => doc.name),
    });
    updated = (await updateCase(caseId, { mailboxMessages })) || updated;
  }

  const refreshedChecklist = generateChecklist(updated);
  updated = (await updateCase(caseId, { checklist: refreshedChecklist })) || updated;

  return NextResponse.json({ case: updated, summary });
}
