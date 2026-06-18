import { redirect } from 'next/navigation';

export default async function ComplianceLegacyCaseRedirectPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  redirect(`/cases/${caseId}/compliance`);
}
