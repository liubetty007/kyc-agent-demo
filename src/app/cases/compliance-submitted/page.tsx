import { requirePageUser } from '@/lib/auth/admin';
import { canAccessCase, canPerformKycOperations } from '@/lib/auth/roles';
import { ComplianceSubmittedPage } from '@/components/ComplianceSubmittedPage';
import { listCases } from '@/lib/kyb/storage';
import { redirect } from 'next/navigation';

export default async function ComplianceSubmittedCasesPage() {
  const user = await requirePageUser();
  if (!canPerformKycOperations(user)) redirect('/');

  const cases = (await listCases()).filter((caseData) => canAccessCase(user, caseData.contactEmail));
  return <ComplianceSubmittedPage cases={cases} />;
}
