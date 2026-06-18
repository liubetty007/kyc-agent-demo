import { requireApiUser } from '@/lib/auth/admin';
import { appendMailboxMessage, COMPLIANCE_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { ingestBackendComplianceEmail, isBackendEnabled } from '@/lib/kyc-backend/client';
import { complianceThreadId, latestComplianceReply } from '@/lib/kyb/caseMailThreads';
import { statusAfterComplianceDecision } from '@/lib/kyb/complianceReview';
import { inferComplianceOutcomeFromText, outcomeForAutomaticComplianceHandling } from '@/lib/kyb/complianceOutcome';
import { hasGmailConfigured, listCaseGmailMessages } from '@/lib/kyb/gmail';
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

function applyComplianceReplyStatus(caseData: Awaited<ReturnType<typeof getCase>>, mailboxMessages: NonNullable<NonNullable<Awaited<ReturnType<typeof getCase>>>['mailboxMessages']>) {
  if (!caseData) return {};
  const reply = latestComplianceReply({ ...caseData, mailboxMessages });
  if (!reply) return {};
  const outcome = outcomeForAutomaticComplianceHandling(
    inferComplianceOutcomeFromText(reply.body),
    reply.body,
  );
  if (caseData.status === 'approved') return {};
  if (caseData.status === 'rejected' && outcome === 'rejected') return {};
  return { status: statusAfterComplianceDecision(outcome) };
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  if (!caseData.complianceEmailSentAt) {
    return NextResponse.json({ error: '请先发送合规审核邮件。' }, { status: 400 });
  }

  try {
    let imported = 0;
    let mailboxMessages = caseData.mailboxMessages || [];

    if (isBackendEnabled() && isBackendCaseId(caseId)) {
      const result = await ingestBackendComplianceEmail(caseId);
      imported = result.imported_messages;
      for (const message of result.messages) {
        mailboxMessages = appendMailboxMessage(
          { ...caseData, mailboxMessages },
          {
            provider: 'gmail',
            providerMessageId: message.gmail_message_id,
            threadId: message.gmail_thread_id,
            from: message.from_email,
            to: COMPLIANCE_TEAM_EMAIL,
            subject: message.subject,
            body: message.body_text,
            direction: 'inbound',
            status: 'received',
          },
        );
      }
      const updated = await updateCase(caseId, {
        complianceGmailThreadId: result.messages[0]?.gmail_thread_id || complianceThreadId(caseData),
        mailboxMessages,
        ...applyComplianceReplyStatus(caseData, mailboxMessages),
      });
      return NextResponse.json({ case: updated, imported });
    }

    if (!hasGmailConfigured()) {
      return NextResponse.json({ error: 'Gmail is not configured.' }, { status: 503 });
    }

    const threadId = complianceThreadId(caseData);
    const kycSender = (process.env.GMAIL_SENDER_EMAIL || '').toLowerCase();
    const messages = await listCaseGmailMessages(caseData);
    const complianceMessages = messages.filter((message) => {
      const from = message.from.toLowerCase();
      const fromEmail = from.match(/<([^>]+)>/)?.[1]?.toLowerCase() || from;
      if (!fromEmail.includes('liubetty007')) return false;
      if (kycSender && fromEmail === kycSender) return false;
      if (threadId && message.threadId !== threadId) return false;
      return !mailboxMessages.some((item) => item.providerMessageId === message.id);
    });

    for (const message of complianceMessages) {
      imported += 1;
      mailboxMessages = appendMailboxMessage(
        { ...caseData, mailboxMessages },
        {
          provider: 'gmail',
          providerMessageId: message.id,
          threadId: message.threadId,
          from: message.from,
          to: COMPLIANCE_TEAM_EMAIL,
          subject: message.subject,
          body: message.body,
          direction: 'inbound',
          status: 'received',
        },
      );
    }

    const updated = await updateCase(caseId, {
      complianceGmailThreadId: threadId || complianceMessages[0]?.threadId,
      mailboxMessages,
      ...applyComplianceReplyStatus(caseData, mailboxMessages),
    });
    return NextResponse.json({ case: updated, imported });
  } catch (error) {
    return apiError(error, 'Compliance reply ingest failed.');
  }
}
