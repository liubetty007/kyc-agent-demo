import { runReview } from '@/lib/kyb/review';
import { requireApiUser } from '@/lib/auth/admin';
import { getCase, updateCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  const review = runReview(caseData);
  const updated = await updateCase(caseId, { review, status: review.recommendedNextAction === 'submit_to_compliance' ? 'ready_for_compliance' : 'agent_reviewed' });
  return NextResponse.json(updated);
}
