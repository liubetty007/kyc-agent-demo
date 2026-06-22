import { requireApiUser } from '@/lib/auth/admin';
import { canPerformKycOperations, canSubmitComplianceDecision } from '@/lib/auth/roles';
import { storeClientEmailUpload } from '@/lib/kyb/documentStorage';
import { getCase } from '@/lib/kyb/storage';
import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request, ['kyc', 'admin', 'compliance']);
  if (user instanceof NextResponse) return user;
  if (!canPerformKycOperations(user) && !canSubmitComplianceDecision(user)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  try {
    const attachment = await storeClientEmailUpload(caseId, file);
    return NextResponse.json({ attachment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 502 },
    );
  }
}
