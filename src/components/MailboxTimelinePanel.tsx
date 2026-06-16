import type { KYCCase } from '@/lib/kyb/types';

export function MailboxTimelinePanel({ caseData }: { caseData: KYCCase }) {
  const messages = [...(caseData.mailboxMessages || [])].reverse();

  return (
    <div className="card">
      <h2>Email Timeline</h2>
      <p>Real Gmail messages appear here when Gmail OAuth is configured. Email Intake Agent analysis is shown for inbound client messages.</p>
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
