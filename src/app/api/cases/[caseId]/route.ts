import { getCase, updateCase } from '@/lib/kyb/storage';
import { generateChecklist } from '@/lib/kyb/checklist';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { NextResponse } from 'next/server';
import { CaseValidationError, validateCasePatch } from '@/lib/kyb/caseValidation';

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
  const current = await getCase(caseId);
  if (!current) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  let patch;
  try {
    patch = validateCasePatch(await request.json());
  } catch (error) {
    if (error instanceof CaseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  patch.checklist = generateChecklist({ ...current, ...patch });
  const updated = await updateCase(caseId, patch);
  if (!updated) return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  return NextResponse.json(updated);
}
