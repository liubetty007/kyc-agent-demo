import { requireApiUser } from '@/lib/auth/admin';
import { ingestDemoMailbox } from '@/lib/kyb/emailIngestion';
import { analyzeEmailForCase } from '@/lib/kyb/emailIntakeAgent';
import { hasGmailConfigured, kycMailboxAddress, listCaseGmailMessages } from '@/lib/kyb/gmail';
import { appendMailboxMessage, customerEmail, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { storeCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { getCase, updateCase, upsertReceivedDocument } from '@/lib/kyb/storage';
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

  if (hasGmailConfigured()) {
    const existingProviderIds = new Set((caseData.mailboxMessages || []).map((message) => message.providerMessageId).filter(Boolean));
    const gmailMessages = (await listCaseGmailMessages(caseData)).filter((message) => !existingProviderIds.has(message.id));
    let updated = caseData;
    const importedDocuments = [];
    const importedMessages = [];

    for (const message of gmailMessages) {
      const analysis = await analyzeEmailForCase(updated, {
        from: message.from,
        subject: message.subject,
        body: message.body,
        attachments: message.attachments.map((attachment) => attachment.filename),
      });

      for (const attachment of message.attachments) {
        const attachmentAnalysis = analysis.attachments.find((item) => item.filename === attachment.filename);
        const requirementId = attachmentAnalysis?.suggestedRequirementId;
        if (!requirementId) continue;
        const storageObject = await storeCaseDocumentBytes({
          caseId,
          filename: attachment.filename,
          contentType: attachment.contentType,
          data: attachment.data,
        });
        const doc = {
          id: `${requirementId}-gmail-${message.id}`,
          requirementId,
          name: attachment.filename,
          status: 'needs_review' as const,
          notes: `Imported from Gmail by Email Intake Agent. ${attachmentAnalysis.reason}`,
          source: 'gmail' as const,
          fromEmail: message.from,
          emailSubject: message.subject,
          receivedAt: message.receivedAt,
          confidence: attachmentAnalysis.confidence,
          storageObject,
        };
        const next = await upsertReceivedDocument(caseId, doc);
        if (next) updated = next;
        importedDocuments.push(doc);
      }

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

    return NextResponse.json({
      mode: 'gmail',
      case: updated,
      summary: {
        importedMessages: importedMessages.length,
        importedDocuments: importedDocuments.length,
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

  return NextResponse.json({ case: updated, summary });
}
