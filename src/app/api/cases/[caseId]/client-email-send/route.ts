import { requireApiUser } from '@/lib/auth/admin';
import { canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { openingEmailSubject, openingThreadId } from '@/lib/kyb/caseMailThreads';
import {
  readClientEmailUpload,
  type ClientEmailAttachmentRef,
  listOpeningEmailStandardDocuments,
  readOpeningEmailAttachment,
} from '@/lib/kyb/documentStorage';
import { followUpTemplateIdsForMissingDocs } from '@/lib/kyb/followUpAttachments';
import { appendMailboxMessage, customerEmailRecipients, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { hasGmailConfigured, kycMailboxAddress, sendGmailMessage, splitEmailDraft } from '@/lib/kyb/gmail';
import { runReview } from '@/lib/kyb/review';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { getBackendChecklist, isBackendEnabled, listBackendDocuments, sendBackendClientFollowUpEmail } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

async function loadUploadedAttachments(caseId: string, objectNames: string[]): Promise<Array<{ filename: string; contentType?: string; data: Buffer }>> {
  const attachments = [];
  for (const objectName of objectNames) {
    const ref: ClientEmailAttachmentRef = {
      id: `client-email:${objectName}`,
      name: objectName.split('/').pop() || objectName,
      objectName,
    };
    attachments.push(await readClientEmailUpload(caseId, ref));
  }
  return attachments;
}

async function localFollowUpAttachments(caseId: string, caseData: Awaited<ReturnType<typeof getCase>>) {
  if (!caseData) return [];

  let missingDocTypes: string[] = [];
  let acceptedDocTypes: string[] = [];
  let rejectedDocTypes: string[] = [];
  if (isBackendEnabled() && isBackendCaseId(caseId)) {
    try {
      const [checklist, documents] = await Promise.all([
        getBackendChecklist(caseId),
        listBackendDocuments(caseId),
      ]);
      missingDocTypes = [
        ...checklist.missing_required,
        ...documents.filter((doc) => doc.review.status === 'rejected' && doc.doc_type).map((doc) => doc.doc_type as string),
      ];
      acceptedDocTypes = checklist.received_doc_types;
      rejectedDocTypes = documents
        .filter((doc) => doc.review.status === 'rejected' && doc.doc_type)
        .map((doc) => doc.doc_type as string);
    } catch {
      missingDocTypes = [];
      acceptedDocTypes = [];
      rejectedDocTypes = [];
    }
  } else {
    const review = caseData.review || runReview(caseData);
    missingDocTypes = [
      ...review.missingDocuments.map((doc) => doc.id),
      ...caseData.receivedDocuments
        .filter((doc) => doc.status === 'invalid')
        .map((doc) => doc.requirementId),
    ];
    acceptedDocTypes = caseData.receivedDocuments
      .filter((doc) => doc.status === 'accepted')
      .map((doc) => doc.requirementId);
    rejectedDocTypes = caseData.receivedDocuments
      .filter((doc) => doc.status === 'invalid')
      .map((doc) => doc.requirementId);
  }

  const templateIds = followUpTemplateIdsForMissingDocs(caseData, {
    neededDocTypes: missingDocTypes,
    acceptedDocTypes,
    rejectedDocTypes,
  });
  if (!templateIds.length) return [];

  const standard = await listOpeningEmailStandardDocuments();
  const attachments = [];
  for (const templateId of templateIds) {
    const ref = standard.find((item) => item.name === templateId || item.objectName.endsWith(`/${templateId}`));
    if (!ref) continue;
    attachments.push(await readOpeningEmailAttachment(caseId, ref));
  }
  return attachments;
}

function apiError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : fallback;
  const statusMatch = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  if (statusMatch) {
    const body = statusMatch[2].trim();
    try {
      const parsed = JSON.parse(body) as { detail?: string };
      if (parsed.detail) return NextResponse.json({ error: parsed.detail }, { status: Number(statusMatch[1]) });
    } catch {
      if (body && body !== 'Internal Server Error') {
        return NextResponse.json({ error: body }, { status: Number(statusMatch[1]) });
      }
    }
  }
  return NextResponse.json({ error: raw || fallback }, { status: 502 });
}

function backendStatus(error: unknown): number | null {
  const raw = error instanceof Error ? error.message : '';
  const statusMatch = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  return statusMatch ? Number(statusMatch[1]) : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;
  if (!canPerformKycOperations(user) && !canSubmitComplianceDecision(user)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  let body: { draft?: string; attachMissingTemplates?: boolean; uploadedObjectNames?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const draft = body.draft || caseData.emailDraft;
  if (!draft?.trim()) {
    return NextResponse.json({ error: '请先生成或填写客户邮件草稿。' }, { status: 400 });
  }

  const attachMissingTemplates = body.attachMissingTemplates !== false;
  const uploadedObjectNames = body.uploadedObjectNames || [];
  const parsed = splitEmailDraft(draft, openingEmailSubject(caseData));
  const threadId = openingThreadId(caseData);

  try {
    const uploadedAttachments = uploadedObjectNames.length
      ? await loadUploadedAttachments(caseId, uploadedObjectNames)
      : [];

    const useGmailDirect = uploadedAttachments.length > 0 || !attachMissingTemplates;

    if (isBackendEnabled() && isBackendCaseId(caseId) && !useGmailDirect) {
      try {
        const sent = await sendBackendClientFollowUpEmail(caseId, {
          subject: parsed.subject,
          body_text: parsed.body,
          include_package_attachments: true,
        });
        const updated = await updateCase(caseId, {
          emailDraft: draft,
          status: 'awaiting_client_information',
          mailboxMessages: appendMailboxMessage(caseData, {
            provider: 'gmail',
            providerMessageId: sent.gmail_message_id,
            threadId: sent.gmail_thread_id || threadId,
            from: kycMailboxAddress() || KYC_TEAM_EMAIL,
            to: customerEmailRecipients(caseData),
            subject: sent.subject,
            body: parsed.body,
            direction: 'outbound',
            status: 'sent',
            attachments: sent.attachments_sent ? [`${sent.attachments_sent} template attachment(s)`] : undefined,
          }),
        });
        return NextResponse.json(updated);
      } catch (error) {
        const status = backendStatus(error);
        if (status !== 404) {
          return apiError(error, 'Client email send failed.');
        }
      }
    }

    if (isBackendEnabled() && isBackendCaseId(caseId) && useGmailDirect && !uploadedAttachments.length) {
      try {
        const sent = await sendBackendClientFollowUpEmail(caseId, {
          subject: parsed.subject,
          body_text: parsed.body,
          include_package_attachments: false,
        });
        const updated = await updateCase(caseId, {
          emailDraft: draft,
          mailboxMessages: appendMailboxMessage(caseData, {
            provider: 'gmail',
            providerMessageId: sent.gmail_message_id,
            threadId: sent.gmail_thread_id || threadId,
            from: kycMailboxAddress() || KYC_TEAM_EMAIL,
            to: customerEmailRecipients(caseData),
            subject: sent.subject,
            body: parsed.body,
            direction: 'outbound',
            status: 'sent',
          }),
        });
        return NextResponse.json(updated);
      } catch (error) {
        const status = backendStatus(error);
        if (status !== 404) {
          return apiError(error, 'Client email send failed.');
        }
      }
    }

    if (!threadId && !caseData.openingEmailSentAt) {
      return NextResponse.json({ error: '未找到开户邮件线程。请先 Send via Gmail 发送开户邮件。' }, { status: 400 });
    }
    if (!hasGmailConfigured()) {
      return NextResponse.json({ error: 'Gmail is not configured.' }, { status: 503 });
    }

    const templateAttachments = attachMissingTemplates ? await localFollowUpAttachments(caseId, caseData) : [];
    const attachments = [...uploadedAttachments, ...templateAttachments];
    const recipients = customerEmailRecipients(caseData);
    const sent = await sendGmailMessage({
      to: recipients,
      subject: parsed.subject,
      body: parsed.body,
      threadId,
      attachments,
    });
    const updated = await updateCase(caseId, {
      emailDraft: draft,
      status: attachMissingTemplates ? 'awaiting_client_information' : caseData.status,
      mailboxMessages: appendMailboxMessage(caseData, {
        provider: 'gmail',
        providerMessageId: sent.id,
        threadId: sent.threadId || threadId,
        from: kycMailboxAddress(),
        to: recipients,
        subject: parsed.subject,
        body: parsed.body,
        direction: 'outbound',
        status: 'sent',
        attachments: attachments.map((attachment) => attachment.filename),
      }),
    });
    return NextResponse.json({ ...updated, attachments_sent: attachments.length, recipients });
  } catch (error) {
    return apiError(error, 'Client email send failed.');
  }
}
