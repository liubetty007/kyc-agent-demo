import Link from 'next/link';
import { CaseActions } from '@/components/CaseActions';
import { CaseSnapshotEditor } from '@/components/CaseSnapshotEditor';
import { ComplianceWorkflowPanel } from '@/components/ComplianceWorkflowPanel';
import { DocumentPanel } from '@/components/DocumentPanel';
import { MailboxTimelinePanel } from '@/components/MailboxTimelinePanel';
import { OpeningEmailPanel } from '@/components/OpeningEmailPanel';
import { ReviewPanel } from '@/components/ReviewPanel';
import { TextOutputPanel } from '@/components/TextOutputPanel';
import { requirePageUser } from '@/lib/auth/admin';
import { canAccessCase, canPerformKycOperations } from '@/lib/auth/roles';
import { caseStatusBadgeClass, caseStatusLabel } from '@/lib/kyb/complianceReview';
import { getCase } from '@/lib/kyb/storage';
import { businessTypeLabel } from '@/lib/kyb/types';

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const user = await requirePageUser();
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) {
    return (
      <div className="card">
        <h1>Case not found</h1>
        <Link className="button" href="/">Back</Link>
      </div>
    );
  }

  const kycCanOperate = canPerformKycOperations(user);

  return (
    <div className="grid">
      <section className="hero">
        <div>
          <Link className="small" href="/cases">← Back to cases</Link>
          <h1>{caseData.companyName}</h1>
          <p>
            {caseData.id} · {caseData.jurisdiction}
            {caseData.usState ? ` (${caseData.usState})` : ''} · {businessTypeLabel(caseData.businessType)}
          </p>
          <span className={`badge ${caseStatusBadgeClass(caseData)}`}>
            {caseStatusLabel(caseData)}
          </span>
        </div>
        {kycCanOperate && <CaseActions caseData={caseData} />}
      </section>

      <OpeningEmailPanel caseData={caseData} readOnly={!kycCanOperate} />
      <MailboxTimelinePanel caseData={caseData} />

      <section className="grid two">
        <CaseSnapshotEditor caseData={caseData} readOnly={!kycCanOperate} />
        <div className="card">
          <h2>Workflow Notes</h2>
          <p>Use the opening email first, then fetch Gmail replies or upload client documents, run Agent review, and prepare the follow-up email or compliance pack.</p>
          <ul className="list">
            <li>
              Company registration place: {caseData.jurisdiction}
              {caseData.usState ? ` (${caseData.usState})` : ''}
            </li>
            {caseData.driveFolderId && (
              <li>
                Client Drive folder:{' '}
                <a href={`https://drive.google.com/drive/folders/${caseData.driveFolderId}`} target="_blank" rel="noreferrer">
                  Open in Google Drive
                </a>
              </li>
            )}
            {caseData.complianceSubmittedAt && (
              <li>Submitted to compliance: {new Date(caseData.complianceSubmittedAt).toLocaleString()}</li>
            )}
            <li>Document intake can be manual, Gmail-based, or demo fallback when Gmail is not configured.</li>
            <li>Policy rules are available under Policy Review.</li>
          </ul>
        </div>
      </section>

      <DocumentPanel caseData={caseData} viewerRole={user.role} />
      <ReviewPanel review={caseData.review} />
      <TextOutputPanel title="Compliance Pack" text={caseData.compliancePack} empty="Generate a compliance pack after running review." />
      <ComplianceWorkflowPanel caseData={caseData} readOnly={!kycCanOperate} />
    </div>
  );
}
