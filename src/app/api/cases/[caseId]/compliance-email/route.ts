import { generateComplianceEmail } from '@/lib/kyb/complianceEmail';
import { requireApiUser } from '@/lib/auth/admin';
import { acceptedDocumentNames, backendAcceptedDocumentNames, loadAcceptedDocumentsZipAttachment } from '@/lib/kyb/complianceAttachments';
import { appendMailboxMessage, defaultComplianceEmail, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { hasGmailConfigured, kycMailboxAddress, sendGmailMessage, splitEmailDraft } from '@/lib/kyb/gmail';
import { runReview } from '@/lib/kyb/review';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { isBackendEnabled, sendBackendComplianceEmail } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

async function resolveAttachmentNames(caseId: string, caseData: Awaited<ReturnType<typeof getCase>>) {
  if (!caseData) return [];
  if (isBackendEnabled() && isBackendCaseId(caseId)) {
    try {
      return await backendAcceptedDocumentNames(caseId);
    } catch (error) {
      console.warn('Backend accepted document list unavailable; falling back to local case data.', error);
    }
  }
  return acceptedDocumentNames(caseData);
}

function apiError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : fallback;
  const statusMatch = raw.match(/^(\d{3}):\s*([\s\S]*)$/);
  if (statusMatch) {
    const body = statusMatch[2].trim();
    try {
      const parsed = JSON.parse(body) as { detail?: string; error?: string };
      if (parsed.detail) return NextResponse.json({ error: parsed.detail }, { status: Number(statusMatch[1]) });
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: Number(statusMatch[1]) });
    } catch {
      if (body && body !== 'Internal Server Error') {
        return NextResponse.json({ error: body }, { status: Number(statusMatch[1]) });
      }
    }
  }
  return NextResponse.json({ error: raw || fallback }, { status: 502 });
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  let body: { action?: string; draft?: string; toEmail?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const review = caseData.review || runReview(caseData);
  const attachmentNames = await resolveAttachmentNames(caseId, caseData);
  const toEmail = (body.toEmail || caseData.complianceEmailTo || defaultComplianceEmail(caseData)).trim();
  const draft = body.draft || caseData.complianceEmailDraft || generateComplianceEmail(caseData, review, attachmentNames, toEmail);
  const parsed = splitEmailDraft(draft, `Compliance Review Request – ${caseData.companyName} (${caseId})`);

  if (body.action === 'send_demo') {
    const updated = await updateCase(caseId, {
      review,
      complianceEmailDraft: draft,
      complianceEmailTo: toEmail,
      complianceEmailSentAt: new Date().toISOString(),
      status: caseData.status === 'approved' ? caseData.status : 'compliance_review',
      mailboxMessages: appendMailboxMessage(caseData, {
        from: KYC_TEAM_EMAIL,
        to: toEmail,
        subject: parsed.subject,
        body: parsed.body,
        direction: 'outbound',
        status: 'sent',
        attachments: attachmentNames.length ? attachmentNames : ['No accepted documents'],
      }),
    });
    return NextResponse.json(updated);
  }

  if (body.action === 'send_real') {
    try {
      if (isBackendEnabled() && isBackendCaseId(caseId)) {
        try {
          const sent = await sendBackendComplianceEmail(caseId, {
            to_email: toEmail,
            subject: parsed.subject,
            body_text: parsed.body,
          });
          const updated = await updateCase(caseId, {
            review,
            complianceEmailDraft: draft,
            complianceEmailTo: toEmail,
            complianceEmailSentAt: new Date().toISOString(),
            complianceGmailThreadId: sent.gmail_thread_id,
            status: caseData.status === 'approved' ? caseData.status : 'compliance_review',
            mailboxMessages: appendMailboxMessage(caseData, {
              provider: 'gmail',
              providerMessageId: sent.gmail_message_id,
              threadId: sent.gmail_thread_id,
              from: kycMailboxAddress() || KYC_TEAM_EMAIL,
              to: toEmail,
              subject: sent.subject,
              body: parsed.body,
              direction: 'outbound',
              status: 'sent',
              attachments: attachmentNames,
            }),
          });
          return NextResponse.json({ ...updated, attachments_sent: sent.attachments_sent });
        } catch (error) {
          console.warn('Backend compliance email send unavailable; falling back to local Gmail sender.', error);
        }
      }

      if (!hasGmailConfigured()) {
        return NextResponse.json({ error: 'Gmail is not configured.' }, { status: 503 });
      }

      const zipAttachment = await loadAcceptedDocumentsZipAttachment(caseData);
      const attachments = zipAttachment ? [zipAttachment] : [];
      const sent = await sendGmailMessage({
        to: toEmail,
        subject: parsed.subject,
        body: parsed.body,
        threadId: caseData.complianceGmailThreadId,
        attachments,
      });
      const updated = await updateCase(caseId, {
        review,
        complianceEmailDraft: draft,
        complianceEmailTo: toEmail,
        complianceEmailSentAt: new Date().toISOString(),
        complianceGmailThreadId: sent.threadId || caseData.complianceGmailThreadId,
        status: caseData.status === 'approved' ? caseData.status : 'compliance_review',
        mailboxMessages: appendMailboxMessage(caseData, {
          provider: 'gmail',
          providerMessageId: sent.id,
          threadId: sent.threadId,
          from: kycMailboxAddress(),
          to: toEmail,
          subject: parsed.subject,
          body: parsed.body,
          direction: 'outbound',
          status: 'sent',
          attachments: attachments.map((item) => item.filename),
        }),
      });
      return NextResponse.json({ ...updated, attachments_sent: attachments.length });
    } catch (error) {
      return apiError(error, 'Compliance email send failed.');
    }
  }

  const updated = await updateCase(caseId, { review, complianceEmailDraft: draft });
  return NextResponse.json(updated);
}
