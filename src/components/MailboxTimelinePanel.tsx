import type { KYCCase, MailboxMessage } from '@/lib/kyb/types';

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function emailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function caseNeedles(caseData: KYCCase): string[] {
  return [caseData.id, caseData.companyName]
    .map((value) => normalize(value || ''))
    .filter((value) => value.length >= 3);
}

function hasCaseContext(caseData: KYCCase, message: MailboxMessage): boolean {
  const text = normalize([
    message.subject,
    message.body,
    ...(message.attachments || []),
  ].join('\n'));
  return caseNeedles(caseData).some((needle) => text.includes(needle));
}

function customerAddress(caseData: KYCCase): string {
  return (caseData.contactEmail || '').toLowerCase();
}

function involvesCustomer(caseData: KYCCase, message: MailboxMessage): boolean {
  const customer = customerAddress(caseData);
  if (!customer) return true;
  return emailAddress(message.from) === customer || emailAddress(message.to) === customer || message.to.toLowerCase().includes(customer);
}

function openingThread(caseData: KYCCase): string | undefined {
  const customer = customerAddress(caseData);
  const messages = caseData.mailboxMessages || [];
  const opening = [...messages]
    .reverse()
    .find((message) => (
      message.direction === 'outbound'
      && message.status === 'sent'
      && message.provider === 'gmail'
      && message.threadId
      && (!customer || message.to.toLowerCase().includes(customer))
    ));
  return opening?.threadId;
}

function isCurrentCaseMessage(caseData: KYCCase, message: MailboxMessage, threadId?: string): boolean {
  const sameThread = Boolean(threadId && message.threadId && message.threadId === threadId);
  const hasContext = hasCaseContext(caseData, message);
  const hasCustomer = involvesCustomer(caseData, message);

  if (sameThread) return hasContext || hasCustomer;
  return hasContext && hasCustomer;
}

export function MailboxTimelinePanel({ caseData }: { caseData: KYCCase }) {
  const threadId = openingThread(caseData);
  const messages = [...(caseData.mailboxMessages || [])]
    .filter((message) => isCurrentCaseMessage(caseData, message, threadId))
    .reverse();

  return (
    <div className="card">
      <h2>Email Timeline</h2>
      <p>Only messages tied to this case, customer, or Gmail thread are shown here.</p>
      {messages.length ? (
        <div className="mailbox-list">
          {messages.map((message) => (
            <div className="mailbox-message" key={message.id}>
              <div className="actions">
                <span className={`badge ${message.direction === 'inbound' ? 'needs-review' : 'accepted'}`}>{message.direction}</span>
                {message.provider && <span className="badge">{message.provider}</span>}
                <span className="small">{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <strong>{message.subject}</strong>
              <p className="small">From: {message.from}<br />To: {message.to}</p>
              {message.attachments?.length ? <p className="small">Attachments: {message.attachments.join(', ')}</p> : null}
              {message.analysis && (
                <div className="agent-analysis">
                  <div className="actions">
                    <span className="badge needs-review">Email Intake Agent</span>
                    <span className="small">Intent: {message.analysis.intent}</span>
                    <span className="small">Confidence: {Math.round(message.analysis.confidence * 100)}%</span>
                    {message.analysis.requiresHumanReview && <span className="badge medium">human review</span>}
                  </div>
                  <p>{message.analysis.summary}</p>
                  {message.analysis.keywords.length ? <p className="small">Keywords: {message.analysis.keywords.join(', ')}</p> : null}
                  {message.analysis.attachments.length ? (
                    <ul className="list">
                      {message.analysis.attachments.map((attachment) => (
                        <li key={attachment.filename}>
                          {attachment.filename}: {attachment.documentType || 'unclassified'}
                          {attachment.suggestedRequirementId ? ` -> ${attachment.suggestedRequirementId}` : ''}
                          {` (${Math.round(attachment.confidence * 100)}%)`}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p>No email activity yet. Send the KYC email or fetch email materials to start the timeline.</p>
      )}
    </div>
  );
}
