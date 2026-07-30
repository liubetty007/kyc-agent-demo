import { CaseForm } from '@/components/CaseForm';
import { requirePageUser } from '@/lib/auth/admin';

export default async function NewCasePage() {
  await requirePageUser(['kyc', 'admin']);
  return (
    <div className="grid">
      <div>
        <h1>Create KYC Case</h1>
        <p>The demo automatically applies AA KYC Rules — 15 Jul 2026 after case creation.</p>
      </div>
      <CaseForm />
    </div>
  );
}
