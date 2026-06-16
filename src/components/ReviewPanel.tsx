import type { ReviewResult } from '@/lib/kyb/types';

export function ReviewPanel({ review }: { review?: ReviewResult }) {
  if (!review) {
    return <div className="card"><h2>Agent Review</h2><p>Run Agent Review to identify missing documents, issues and next action.</p></div>;
  }
  return (
    <div className="card">
      <h2>Agent Review</h2>
      <div className="grid three">
        <div><h3>Jurisdiction</h3><span className={`badge ${review.jurisdictionAssessment.status === 'accepted' ? 'ready' : 'legal'}`}>{review.jurisdictionAssessment.status}</span><ul className="list">{review.jurisdictionAssessment.notes.map((n) => <li key={n}>{n}</li>)}</ul></div>
        <div><h3>Business Flags</h3><ul className="list">{review.businessAssessment.riskFlags.map((f) => <li key={f}>{f}</li>)}</ul></div>
        <div><h3>Next Action</h3><span className="badge high">{review.recommendedNextAction}</span></div>
      </div>
      <h3>Missing Documents</h3>
      <ul className="list">{review.missingDocuments.length ? review.missingDocuments.map((doc) => <li key={doc.id}>{doc.name} — {doc.reason}</li>) : <li>No required document gaps found.</li>}</ul>
      <h3>Issues</h3>
      <ul className="list">{review.issues.length ? review.issues.map((issue) => <li key={`${issue.code}-${issue.message}`}>[{issue.severity}] {issue.message}</li>) : <li>No issues found.</li>}</ul>
      <h3>Questions for Client</h3>
      <ul className="list">{review.questionsForClient.length ? review.questionsForClient.map((q) => <li key={q}>{q}</li>) : <li>No client questions.</li>}</ul>
    </div>
  );
}
