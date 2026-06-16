import type { KYCCase } from '@/lib/kyb/types';

export function MailboxTimelinePanel({ caseData }: { caseData: KYCCase }) {
  const messages = [...(caseData.mailboxMessages || [])].reverse();

  return (
    <div className="card">
      <h2>Virtual Mailboxes</h2>
      <p>Demo-only mailbox flow between Customer, KYC Team, and Compliance Team. No real email is sent.</p>
      {messages.length ? (
        <div className="mailbox-list">
          {messages.map((message) => (
            <div className="mailbox-message" key={message.id}>
              <div className="actions">
                <span className={`badge ${message.direction === 'inbound' ? 'needs-review' : 'accepted'}`}>{message.direction}</span>
                <span className="small">{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <strong>{message.subject}</strong>
              <p className="small">From: {message.from}<br />To: {message.to}</p>
              {message.attachments?.length ? <p className="small">Attachments: {message.attachments.join(', ')}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p>No virtual mailbox activity yet. Demo-send the KYC email or fetch email materials to start the timeline.</p>
      )}
    </div>
  );
}
