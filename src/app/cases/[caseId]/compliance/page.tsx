import Link from 'next/link';
import { ComplianceWorkflowPanel } from '@/components/ComplianceWorkflowPanel';
import { requirePageUser } from '@/lib/auth/admin';
import { canAccessCase, canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { caseStatusBadgeClass, caseStatusLabel } from '@/lib/kyb/complianceReview';
import { getCase } from '@/lib/kyb/storage';

export default async function ComplianceCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const user = await requirePageUser();
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) {
    return (
      <div className="card">
        <h1>案件未找到</h1>
        <Link className="button" href="/cases/compliance-submitted">返回</Link>
      </div>
    );
  }

  const kycCanOperate = canPerformKycOperations(user);
  const canDecide = canSubmitComplianceDecision(user) || kycCanOperate;

  return (
    <div className="grid page-stack">
      <section className="page-header">
        <Link className="page-back" href="/cases/compliance-submitted">← 返回已送合规</Link>
        <h1>{caseData.companyName}</h1>
        <p className="small">
          {caseData.jurisdiction}
          {caseData.contactEmail ? ` · ${caseData.contactEmail}` : ''}
        </p>
        <span className={`badge ${caseStatusBadgeClass(caseData)}`}>{caseStatusLabel(caseData)}</span>
      </section>

      <ComplianceWorkflowPanel caseData={caseData} kycCanOperate={kycCanOperate} canDecide={canDecide} />
    </div>
  );
}
