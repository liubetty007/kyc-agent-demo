import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/admin';
import { canAccessCase } from '@/lib/auth/roles';
import { analyzeCaseDocument, llmProviderLabel, type DocumentAnalysis } from '@/lib/kyb/documentAnalysis';
import { generateChecklist } from '@/lib/kyb/checklist';
import { readCaseDocumentBytes } from '@/lib/kyb/documentStorage';
import { getCase } from '@/lib/kyb/storage';
import type { KYCCase, ReceivedDocument } from '@/lib/kyb/types';
import { ANALYSIS_UPLOAD_TYPES, readValidatedUpload, UploadValidationError } from '@/lib/kyb/uploadSecurity';

const MAX_ANALYSIS_FILES = 10;

function collectFiles(form: FormData): File[] {
  const files = form.getAll('files').filter((item): item is File => item instanceof File);
  const single = form.get('file');
  if (single instanceof File) files.unshift(single);
  return files;
}

function collectDocumentIds(form: FormData): string[] {
  return form.getAll('documentIds').map((value) => String(value || '').trim()).filter(Boolean);
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function requirementName(caseData: KYCCase, requirementId?: string): string | undefined {
  if (!requirementId) return undefined;
  return generateChecklist(caseData).find((item) => item.id === requirementId)?.name;
}

function failedReadAnalysis(caseData: KYCCase, doc: ReceivedDocument, error: unknown): DocumentAnalysis {
  const reason = readableError(error);
  const isGoogleAuth = /google oauth|gmail oauth|invalid_grant|invalid_scope/i.test(reason);
  console.error(`Document read failed for ${doc.id}: ${isGoogleAuth ? 'Google authorization error' : 'storage read error'}.`);
  return {
    filename: doc.name,
    storageObject: doc.storageObject,
    extractionMethod: 'unreadable',
    extractedTextPreview: '',
    summary: isGoogleAuth
      ? 'The file could not be read because Google Gmail/Drive OAuth authorization failed before analysis started.'
      : 'The file could not be read from storage before analysis started.',
    suggestedRequirementId: doc.requirementId,
    suggestedRequirementName: requirementName(caseData, doc.requirementId),
    confidence: 0,
    templateMatchApplicable: false,
    keyPoints: [],
    riskFlags: ['file_read_failed', ...(isGoogleAuth ? ['google_oauth_failed'] : [])],
    missingFields: [],
    issues: [isGoogleAuth ? 'Storage authorization failed before analysis.' : 'The stored file could not be read.'],
    recommendations: isGoogleAuth
      ? ['Reconnect or refresh the Google Gmail/Drive OAuth token, then run Analyze again.']
      : ['Re-upload this file or check that the stored Drive file still exists and is accessible.'],
    followUpPoints: [],
    severity: 'high',
    requiresHumanReview: true,
  };
}

function failedAnalyzeAnalysis(caseData: KYCCase, doc: ReceivedDocument, error: unknown): DocumentAnalysis {
  console.error(`Document analysis failed for ${doc.id}: ${error instanceof Error ? error.name : 'unknown error'}.`);
  return {
    filename: doc.name,
    storageObject: doc.storageObject,
    extractionMethod: 'analysis_failed',
    extractedTextPreview: '',
    summary: 'The file was read, but automated analysis failed before a review result could be produced.',
    suggestedRequirementId: doc.requirementId,
    suggestedRequirementName: requirementName(caseData, doc.requirementId),
    confidence: 0,
    templateMatchApplicable: false,
    keyPoints: [],
    riskFlags: ['analysis_failed'],
    missingFields: [],
    issues: ['Automated analysis failed. Manual review is required.'],
    recommendations: ['Retry Analyze. If this repeats, check the LLM service and document parser logs.'],
    followUpPoints: [],
    severity: 'medium',
    requiresHumanReview: true,
  };
}

function analysisResponse(analyses: DocumentAnalysis[]) {
  const failures = analyses.filter((analysis) => ['unreadable', 'analysis_failed'].includes(analysis.extractionMethod));
  const provider = llmProviderLabel();
  if (!failures.length) return NextResponse.json({ provider, analyses });

  const googleAuthorizationFailed = failures.some((analysis) => analysis.riskFlags.includes('google_oauth_failed'));
  const error = googleAuthorizationFailed
    ? 'Google Gmail/Drive authorization has expired or is missing required permissions. No unreadable file was sent to PaddleOCR or the LLM. Please reconnect Betty’s Google account and retry Analyze.'
    : 'One or more files could not be read or analyzed. Review the failed rows and retry before relying on the analysis.';

  if (failures.length === analyses.length) {
    return NextResponse.json({ provider, analyses, error }, { status: googleAuthorizationFailed ? 503 : 502 });
  }
  return NextResponse.json({
    provider,
    analyses,
    warning: `${failures.length} of ${analyses.length} files failed analysis.`,
  }, { status: 207 });
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { caseId } = await params;
  const caseData = await getCase(caseId);
  if (!caseData || !canAccessCase(user, caseData.contactEmail)) {
    return NextResponse.json({ error: 'Case not found' }, { status: 404 });
  }

  if (!request.headers.get('content-type')?.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'multipart/form-data is required.' }, { status: 400 });
  }

  const form = await request.formData();
  const files = collectFiles(form);
  const requestedDocumentIds = collectDocumentIds(form);

  const analyses = [];
  if (files.length) {
    if (files.length > MAX_ANALYSIS_FILES) {
      return NextResponse.json({ error: `A maximum of ${MAX_ANALYSIS_FILES} files may be analyzed at once.` }, { status: 400 });
    }
    if (files.reduce((total, file) => total + file.size, 0) > 40 * 1024 * 1024) {
      return NextResponse.json({ error: 'Combined analysis uploads exceed the 40 MB limit.' }, { status: 400 });
    }
    for (const file of files) {
      let data: Buffer;
      try {
        data = await readValidatedUpload(file, ANALYSIS_UPLOAD_TYPES, 20 * 1024 * 1024);
      } catch (error) {
        if (error instanceof UploadValidationError) {
          return NextResponse.json({ error: `${file.name}: ${error.message}` }, { status: 400 });
        }
        throw error;
      }
      try {
        const analysis = await analyzeCaseDocument({
          caseData,
          filename: file.name,
          mimeType: file.type || undefined,
          content: data,
        });
        analyses.push(analysis);
      } catch (error) {
        const syntheticDoc: ReceivedDocument = {
          id: file.name,
          requirementId: '',
          name: file.name,
          status: 'needs_review',
          storageObject: undefined,
        };
        analyses.push(failedAnalyzeAnalysis(caseData, syntheticDoc, error));
      }
    }
    return analysisResponse(analyses);
  }

  const receivedDocuments = (requestedDocumentIds.length
    ? caseData.receivedDocuments.filter((doc) => requestedDocumentIds.includes(doc.id))
    : caseData.receivedDocuments
  ).filter((doc) => Boolean(doc.storageObject));

  if (!receivedDocuments.length) {
    return NextResponse.json({ error: 'No checklist files are available to analyze.' }, { status: 400 });
  }

  for (const doc of receivedDocuments) {
    const storageObject = doc.storageObject || '';
    let data: Buffer;
    try {
      data = await readCaseDocumentBytes(storageObject);
    } catch (error) {
      analyses.push(failedReadAnalysis(caseData, doc, error));
      continue;
    }

    try {
      const analysis = await analyzeCaseDocument({
        caseData,
        filename: doc.name,
        content: data,
        storageObject,
      });
      analyses.push({
        ...analysis,
        storageObject,
      });
    } catch (error) {
      analyses.push(failedAnalyzeAnalysis(caseData, doc, error));
    }
  }

  return analysisResponse(analyses);
}
