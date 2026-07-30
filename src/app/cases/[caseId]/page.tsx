import Link from 'next/link';
import { CaseActions } from '@/components/CaseActions';
import { EmailReplyFetchPanel } from '@/components/EmailReplyFetchPanel';
import { CaseSnapshotEditor } from '@/components/CaseSnapshotEditor';
import { ClientFollowUpEmailPanel } from '@/components/ClientFollowUpEmailPanel';
import { ClientUploadedFilesPanel } from '@/components/ClientUploadedFilesPanel';
import { ComplianceReplySummary } from '@/components/ComplianceReplySummary';
import { DocumentAnalysisPanel } from '@/components/DocumentAnalysisPanel';
import { DocumentPanel } from '@/components/DocumentPanel';
import { KycComplianceSubmitPanel } from '@/components/KycComplianceSubmitPanel';
import { MailboxTimelinePanel } from '@/components/MailboxTimelinePanel';
import { OpeningEmailPanel } from '@/components/OpeningEmailPanel';
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
      </section>

      <CaseSnapshotEditor caseData={caseData} readOnly={!kycCanOperate} />
      <OpeningEmailPanel caseData={caseData} readOnly={!kycCanOperate} />

      <div className="card">
        <h2>Workflow Notes</h2>
        <p>Save the case details, send the opening email, fetch the client reply, analyze the documents, and send supplemental-document requests as many times as needed.</p>
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
          <li>Risk Rating is shown only after Compliance returns its review result.</li>
        </ul>
      </div>

      <EmailReplyFetchPanel caseData={caseData} readOnly={!kycCanOperate} />
      <DocumentPanel caseData={caseData} viewerRole={user.role} />
      <DocumentAnalysisPanel caseData={caseData} />
      <ClientFollowUpEmailPanel caseData={caseData} readOnly={!kycCanOperate} />
      <ClientUploadedFilesPanel caseData={caseData} />
      {kycCanOperate && <CaseActions caseData={caseData} />}
      <MailboxTimelinePanel caseData={caseData} />
      <KycComplianceSubmitPanel caseData={caseData} readOnly={!kycCanOperate} />
      <ComplianceReplySummary caseData={caseData} />
    </div>
  );
}
