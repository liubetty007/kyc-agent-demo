import { requireApiUser } from '@/lib/auth/admin';
import { openingThreadId } from '@/lib/kyb/caseMailThreads';
import { appendMailboxMessage, customerEmail, KYC_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { hasGmailConfigured, kycMailboxAddress, sendGmailMessage, splitEmailDraft } from '@/lib/kyb/gmail';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { isBackendEnabled, sendBackendClientFollowUpEmail } from '@/lib/kyc-backend/client';
import { NextResponse } from 'next/server';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
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
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  let body: { draft?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const draft = body.draft || caseData.emailDraft;
  if (!draft?.trim()) {
    return NextResponse.json({ error: '请先生成或填写客户邮件草稿。' }, { status: 400 });
  }

  const parsed = splitEmailDraft(draft, `Additional Documents Required – ${caseData.companyName}`);
  const threadId = openingThreadId(caseData);

  try {
    if (isBackendEnabled() && isBackendCaseId(caseId)) {
      try {
        const sent = await sendBackendClientFollowUpEmail(caseId, {
          subject: parsed.subject,
          body_text: parsed.body,
        });
        const updated = await updateCase(caseId, {
          emailDraft: draft,
          status: 'awaiting_client_information',
          mailboxMessages: appendMailboxMessage(caseData, {
            provider: 'gmail',
            providerMessageId: sent.gmail_message_id,
            threadId: sent.gmail_thread_id || threadId,
            from: kycMailboxAddress() || KYC_TEAM_EMAIL,
            to: customerEmail(caseData),
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

    if (!threadId) {
      return NextResponse.json({ error: '未找到开户邮件线程。请先 Send via Gmail 发送开户邮件。' }, { status: 400 });
    }
    if (!hasGmailConfigured()) {
      return NextResponse.json({ error: 'Gmail is not configured.' }, { status: 503 });
    }

    const sent = await sendGmailMessage({
      to: customerEmail(caseData),
      subject: parsed.subject,
      body: parsed.body,
      threadId,
    });
    const updated = await updateCase(caseId, {
      emailDraft: draft,
      status: 'awaiting_client_information',
      mailboxMessages: appendMailboxMessage(caseData, {
        provider: 'gmail',
        providerMessageId: sent.id,
        threadId: sent.threadId || threadId,
        from: kycMailboxAddress(),
        to: customerEmail(caseData),
        subject: parsed.subject,
        body: parsed.body,
        direction: 'outbound',
        status: 'sent',
      }),
    });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error, 'Client email send failed.');
  }
}
