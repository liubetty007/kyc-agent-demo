import Link from 'next/link';
import { CaseActions } from '@/components/CaseActions';
import { CaseSnapshotEditor } from '@/components/CaseSnapshotEditor';
import { ComplianceEmailPanel } from '@/components/ComplianceEmailPanel';
import { DocumentPanel } from '@/components/DocumentPanel';
import { EditableEmailPanel } from '@/components/EditableEmailPanel';
import { MailboxTimelinePanel } from '@/components/MailboxTimelinePanel';
import { OpeningEmailPanel } from '@/components/OpeningEmailPanel';
import { ReviewPanel } from '@/components/ReviewPanel';
import { TextOutputPanel } from '@/components/TextOutputPanel';
import { requirePageUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { getCase } from '@/lib/kyb/storage';

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const user = await requirePageUser();
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) {
    return <div className="card"><h1>Case not found</h1><Link className="button" href="/">Back</Link></div>;
  }

  return (
    <div className="grid">
      <section className="hero">
        <div>
          <Link className="small" href="/">← Back to cases</Link>
          <h1>{caseData.companyName}</h1>
          <p>{caseData.id} · {caseData.jurisdiction}{caseData.usState ? ` (${caseData.usState})` : ''} · {caseData.businessType}</p>
          <span className={`badge ${caseData.status === 'ready_for_compliance' ? 'ready' : caseData.status === 'prohibited' ? 'prohibited' : ''}`}>{caseData.status}</span>
        </div>
        {user.role !== 'client' && <CaseActions caseData={caseData} />}
      </section>

      <OpeningEmailPanel caseData={caseData} />
      <MailboxTimelinePanel caseData={caseData} />

      <section className="grid two">
        <CaseSnapshotEditor caseData={caseData} />
        <div className="card">
          <h2>Workflow Notes</h2>
          <p>Use the opening email first, then fetch or upload client documents, run Agent review, and prepare the follow-up email or compliance pack.</p>
          <ul className="list">
            <li>Company registration place: {caseData.jurisdiction}{caseData.usState ? ` (${caseData.usState})` : ''}</li>
            <li>Document intake can be manual or via demo email ingestion.</li>
            <li>Policy rules are available under Policy Review.</li>
          </ul>
        </div>
      </section>

      <DocumentPanel caseData={caseData} viewerRole={user.role} />
      <ReviewPanel review={caseData.review} />
      <EditableEmailPanel caseId={caseData.id} title="Client Email Draft" text={caseData.emailDraft} empty="Generate an email draft after running review." field="emailDraft" />
      <TextOutputPanel title="Compliance Pack" text={caseData.compliancePack} empty="Generate a compliance pack after running review." />
      <ComplianceEmailPanel caseData={caseData} />
    </div>
  );
}
