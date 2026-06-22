import { createCase, listCases } from '@/lib/kyb/storage';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import type { BusinessType, CaseLanguage, Jurisdiction } from '@/lib/kyb/types';
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
    const body = await request.json();
    const created = await createCase({
      companyName: body.companyName,
      contactEmail: body.contactEmail,
      jurisdiction: body.jurisdiction as Jurisdiction,
      usState: body.usState,
      businessType: body.businessType as BusinessType,
      sourceOfFunds: body.sourceOfFunds,
      needsNsBusiness: Boolean(body.needsNsBusiness),
      language: (body.language as CaseLanguage) || 'zh',
    });
    return NextResponse.json(created);
  } catch (error) {
    console.error('Failed to create case', error);
    return NextResponse.json({ error: 'Failed to create case' }, { status: 500 });
  }
}
