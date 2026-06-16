import { getCase, updateCase } from '@/lib/kyb/storage';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  return NextResponse.json(caseData);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  const { caseId } = await params;
  const body = await request.json();
  const updated = await updateCase(caseId, body);
  if (!updated) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  return NextResponse.json(updated);
}
