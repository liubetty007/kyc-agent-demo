import { requireApiUser } from '@/lib/auth/admin';
import { canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { appendMailboxMessage, COMPLIANCE_TEAM_EMAIL } from '@/lib/kyb/mailbox';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { ingestBackendComplianceEmail, isBackendEnabled } from '@/lib/kyc-backend/client';
import { complianceThreadId, latestComplianceReply } from '@/lib/kyb/caseMailThreads';
import { analyzeComplianceReplyText } from '@/lib/kyb/complianceReplyAnalysis';
import { hasGmailConfigured, listCaseGmailMessages } from '@/lib/kyb/gmail';
import { NextResponse } from 'next/server';
import { safeUpstreamErrorResponse } from '@/lib/api/errorResponse';
import { currentComplianceRound, feedbackAfterCurrentSubmission, updateCurrentComplianceRound } from '@/lib/kyb/complianceWorkflow';

function isBackendCaseId(caseId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
}

function apiError(error: unknown, fallback: string) {
  return safeUpstreamErrorResponse('Compliance email ingestion failed', error, fallback);
}

function analyzeComplianceReply(caseData: Awaited<ReturnType<typeof getCase>>, mailboxMessages: NonNullable<NonNullable<Awaited<ReturnType<typeof getCase>>>['mailboxMessages']>) {
  if (!caseData) return {};
  const reply = latestComplianceReply({ ...caseData, mailboxMessages });
  if (!reply) return {};
  const complianceReplyAnalysis = analyzeComplianceReplyText(reply.body);
  const riskRating = complianceReplyAnalysis.riskLevel === 'unclear'
    ? caseData.riskRating
    : complianceReplyAnalysis.riskLevel;
  return { complianceReplyAnalysis, riskRating };
}

function complianceFeedbackPatch(
  caseData: NonNullable<Awaited<ReturnType<typeof getCase>>>,
  mailboxMessages: NonNullable<NonNullable<Awaited<ReturnType<typeof getCase>>>['mailboxMessages']>,
) {
  const analysisPatch = analyzeComplianceReply(caseData, mailboxMessages);
  const workingCase = { ...caseData, ...analysisPatch, mailboxMessages };
  const feedback = feedbackAfterCurrentSubmission(workingCase);
  if (!feedback || !currentComplianceRound(caseData)?.emailSentAt) return analysisPatch;
  const changesRequested = feedback.outcome === 'request_more_info' || feedback.outcome === 'edd_required';
  return {
    ...analysisPatch,
    status: changesRequested
      ? (feedback.outcome === 'edd_required' ? 'edd_required' as const : 'awaiting_client_information' as const)
      : caseData.status,
    complianceReviewRounds: updateCurrentComplianceRound(caseData, {
      status: changesRequested ? 'changes_requested' : 'sent',
      feedbackAt: feedback.at,
      feedbackOutcome: feedback.outcome,
    }),
  };
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
        ...complianceFeedbackPatch(caseData, mailboxMessages),
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
      const allowedComplianceSenders = new Set(
        (process.env.KYC_COMPLIANCE_EMAILS || COMPLIANCE_TEAM_EMAIL)
          .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
      );
      if (!allowedComplianceSenders.has(fromEmail)) return false;
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
      ...complianceFeedbackPatch(caseData, mailboxMessages),
    });
    return NextResponse.json({ case: updated, imported });
  } catch (error) {
    return apiError(error, 'Compliance reply ingest failed.');
  }
}
