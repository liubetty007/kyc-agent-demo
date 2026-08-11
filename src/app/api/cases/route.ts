import { createCase, listCases } from '@/lib/kyb/storage';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { CaseValidationError, validateNewCaseInput } from '@/lib/kyb/caseValidation';
import { safeErrorResponse } from '@/lib/api/errorResponse';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return NextResponse.json((await listCases()).filter((caseData) => canAccessCase(user, caseData.contactEmail)));
}

export async function POST(request: Request) {
  const user = await requireApiUser(request, ['kyc', 'admin']);
  if (user instanceof NextResponse) return user;
  try {
    const created = await createCase(validateNewCaseInput(await request.json()));
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof CaseValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return safeErrorResponse('Case creation failed', error, 'Failed to create case');
  }
}
