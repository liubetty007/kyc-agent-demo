import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase, type AppUser } from '@/lib/auth/roles';
import {
  assistantCapabilitiesMessage,
  handleAssistantMessage,
  handleAssistantUpload,
  initialAssistantSession,
  type AssistantSession,
} from '@/lib/kyb/homeAssistant';
import { storeCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { ensureCaseDriveFolder } from '@/lib/kyb/driveFolders';
import { createCase, getCase, listCases, upsertReceivedDocument } from '@/lib/kyb/storage';
import type { BusinessType, CaseLanguage, Jurisdiction } from '@/lib/kyb/types';
import { NextResponse } from 'next/server';

const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

function canCreateCases(role: string): boolean {
  return role === 'kyc' || role === 'admin';
}

async function accessibleCases(user: AppUser) {
  return (await listCases()).filter((caseData) => canAccessCase(user, caseData.contactEmail));
}

async function createCaseFromDraft(draft: NonNullable<AssistantSession['createCaseDraft']>) {
  return createCase({
    companyName: draft.companyName!,
    contactEmail: draft.contactEmail,
    jurisdiction: draft.jurisdiction as Jurisdiction,
    usState: draft.usState,
    businessType: draft.businessType as BusinessType,
    sourceOfFunds: draft.sourceOfFunds!,
    needsNsBusiness: Boolean(draft.needsNsBusiness),
    language: (draft.language as CaseLanguage) || 'zh',
  });
}

export async function GET() {
  return NextResponse.json({
    welcome: '你好，我是 KYC 助手。你可以创建新 Case、查询客户进展，或直接上传补充资料。',
    capabilities: assistantCapabilitiesMessage,
  });
}

export async function POST(request: Request) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const contentType = request.headers.get('content-type') || '';
  const cases = await accessibleCases(user);
  const canCreate = canCreateCases(user.role);

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    const message = String(form.get('message') || '');
    let session: AssistantSession = initialAssistantSession();
    try {
      session = JSON.parse(String(form.get('session') || '{}')) as AssistantSession;
    } catch {
      session = initialAssistantSession();
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required.' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds the 15 MB limit.' }, { status: 400 });
    }
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only PDF, Word, Excel, TXT, CSV, JPEG, and PNG files are allowed.' }, { status: 400 });
    }

    const reply = await handleAssistantUpload({
      message,
      session,
      cases,
      filename: file.name,
      upload: async (caseId, requirementId, requirementName) => {
        const caseData = await getCase(caseId);
        if (!caseData || !canAccessCase(user, caseData.contactEmail)) return undefined;
        const driveFolderId = await ensureCaseDriveFolder(caseId);
        const storageObject = await storeCaseDocumentBytes({
          caseId,
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          data: Buffer.from(await file.arrayBuffer()),
          parentFolderId: driveFolderId,
        });
        return upsertReceivedDocument(caseId, {
          id: `${requirementId}-${Date.now()}`,
          requirementId,
          name: requirementName || file.name,
          status: 'received',
          notes: `Uploaded via home assistant by ${user.email}.`,
          source: 'manual',
          receivedAt: new Date().toISOString(),
          storageObject,
        });
      },
    });
    return NextResponse.json(reply);
  }

  let body: { message?: string; session?: AssistantSession; choiceId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const message = String(body.message || body.choiceId || '').trim();
  const session = body.session || initialAssistantSession();

  if (body.choiceId === 'confirm_create' || message === 'confirm_create' || message === '确认创建') {
    if (!canCreate) {
      return NextResponse.json({ message: '你当前账号没有创建 Case 的权限。', session: { mode: 'idle' } });
    }
    const draft = session.createCaseDraft;
    if (!draft?.companyName || !draft.jurisdiction || !draft.businessType || !draft.sourceOfFunds) {
      return NextResponse.json({
        message: '创建信息还不完整，请继续补充。',
        session: { mode: 'create_case', createCaseDraft: draft || {} },
      });
    }
    try {
      const created = await createCaseFromDraft(draft);
      return NextResponse.json({
        message: `已创建 **${created.companyName}** 的 Case。你可以进入案件页继续发开户邮件或查看 checklist。`,
        session: { mode: 'idle' },
        createdCaseId: created.id,
        links: [{ href: `/cases/${created.id}`, label: `进入 ${created.companyName}` }],
      });
    } catch (error) {
      return NextResponse.json({
        message: error instanceof Error ? error.message : '创建 Case 失败。',
        session: { mode: 'create_case', createCaseDraft: draft },
      }, { status: 500 });
    }
  }

  const reply = await handleAssistantMessage({
    message,
    session,
    cases,
    canCreate,
    choiceId: body.choiceId,
  });
  return NextResponse.json(reply);
}
