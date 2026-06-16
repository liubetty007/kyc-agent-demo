import Link from 'next/link';
import { requirePageUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { listCases } from '@/lib/kyb/storage';

export default async function HomePage() {
  const user = await requirePageUser();
  const cases = (await listCases()).filter((caseData) => canAccessCase(user, caseData.contactEmail));
  return (
    <div className="grid">
      <section className="hero">
        <div>
          <h1>KYC Agent</h1>
          <p>Fast demo workflow: create case → generate checklist → mark received docs → run Agent review → draft email → generate compliance pack.</p>
        </div>
        {user.role !== 'client' && <Link className="button primary" href="/cases/new">Create New Case</Link>}
      </section>
      <section className="card">
        <h2>Cases</h2>
        <table className="table">
          <thead><tr><th>Case ID</th><th>Company</th><th>Jurisdiction</th><th>Business</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {cases.map((caseData) => (
              <tr key={caseData.id}>
                <td>{caseData.id}</td>
                <td><strong>{caseData.companyName}</strong></td>
                <td>{caseData.jurisdiction}</td>
                <td>{caseData.businessType}</td>
                <td><span className={`badge ${caseData.status === 'ready_for_compliance' ? 'ready' : caseData.status === 'prohibited' ? 'prohibited' : ''}`}>{caseData.status}</span></td>
                <td><Link className="button" href={`/cases/${caseData.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
