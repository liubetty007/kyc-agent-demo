import { requirePageUser } from '@/lib/auth/admin';
import { canAccessCase, canManageCases } from '@/lib/auth/roles';
import { HomeDashboard } from '@/components/HomeDashboard';
import { listCases } from '@/lib/kyb/storage';

export default async function HomePage() {
  const user = await requirePageUser();
  const cases = (await listCases()).filter((caseData) => canAccessCase(user, caseData.contactEmail));
  return <HomeDashboard cases={cases} canCreate={canManageCases(user)} />;
}
