import { requirePageUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { CasesListPage } from '@/components/CasesListPage';
import { listCases } from '@/lib/kyb/storage';

export default async function CompletedCasesPage() {
  const user = await requirePageUser();
  const cases = (await listCases()).filter((caseData) => canAccessCase(user, caseData.contactEmail));
  return <CasesListPage cases={cases} filter="completed" showSearch />;
}
