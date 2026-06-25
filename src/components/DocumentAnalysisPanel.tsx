'use client';

import { useState } from 'react';
import type { DocumentAnalysis } from '@/lib/kyb/documentAnalysis';
import type { KYCCase } from '@/lib/kyb/types';

type AnalyzeResponse = {
  provider: string;
  analyses: DocumentAnalysis[];
};

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function AnalysisList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="analysis-detail-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export function DocumentAnalysisPanel({ caseData }: { caseData: KYCCase }) {
  const [analyses, setAnalyses] = useState<DocumentAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState('');

  const checklistFiles = caseData.receivedDocuments.filter((doc) => Boolean(doc.storageObject));

  async function analyzeChecklistFiles() {
    if (!checklistFiles.length) return;
    setLoading(true);
    setError('');
    const form = new FormData();
    for (const doc of checklistFiles) form.append('documentIds', doc.id);
    const response = await fetch(`/api/cases/${caseData.id}/document-analysis`, { method: 'POST', body: form });
    const data = (await response.json().catch(() => ({}))) as Partial<AnalyzeResponse> & { error?: string };
    if (!response.ok) {
      setError(data.error || 'Analysis failed.');
      setLoading(false);
      return;
    }
    setAnalyses(data.analyses || []);
    setProvider(data.provider || '');
    setLoading(false);
  }

  return (
    <div className="card document-analysis-card">
      <div className="card-heading">
        <h2>Analyze</h2>
        <span className="small">LLM review for checklist files</span>
      </div>
      <p>
        Analyze files already received in the checklist. Template percentage is shown only for NDA and Board Resolution,
        where the submitted file should be compared with the standard template. Other files are reviewed for completeness and consistency.
      </p>

      <div className="document-toolbar">
        <button className="button primary" type="button" disabled={loading || !checklistFiles.length} onClick={analyzeChecklistFiles}>
          {loading ? 'Analyzing…' : 'Analyze checklist files'}
        </button>
        {provider && <span className="small">Provider: {provider}</span>}
      </div>

      {error && <p className="form-error">{error}</p>}

      {checklistFiles.length > 0 && (
        <div className="analysis-file-list">
          {checklistFiles.map((doc) => (
            <div className="analysis-file-row" key={doc.id}>
              <div>
                <strong>{doc.name}</strong>
                <div className="small">{doc.status} · {doc.source || 'received'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {analyses.length > 0 && (
        <table className="table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>File</th>
              <th>Match</th>
              <th>Template Check</th>
              <th>Review Feedback</th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((analysis) => (
              <tr key={`${analysis.filename}-${analysis.storageObject || analysis.summary}`}>
                <td>
                  <strong>{analysis.filename}</strong>
                  <div className="small">{analysis.extractionMethod}</div>
                </td>
                <td>
                  <div>{analysis.suggestedRequirementName || 'Unmatched'}</div>
                  {analysis.suggestedRequirementId && <div className="small">{analysis.suggestedRequirementId}</div>}
                </td>
                <td>
                  {analysis.templateMatchApplicable && typeof analysis.templateMatchScore === 'number' ? (
                    <>
                      <span className={`badge ${analysis.templateMatchScore >= 0.8 ? 'accepted' : analysis.templateMatchScore >= 0.5 ? 'medium' : 'prohibited'}`}>
                        {formatConfidence(analysis.templateMatchScore)}
                      </span>
                      <div className="small">Template consistency</div>
                    </>
                  ) : (
                    <>
                      <span className="small">Not applicable</span>
                      <div className="small">No template percentage for this document type</div>
                    </>
                  )}
                  {analysis.severity && <div className="small">Issue Severity: {analysis.severity}</div>}
                </td>
                <td>
                  <div>{analysis.summary}</div>
                  {analysis.templateMatchSummary && <div className="small">{analysis.templateMatchSummary}</div>}
                  <AnalysisList title="Missing / incomplete fields" items={analysis.missingFields} />
                  <AnalysisList title="Issues" items={analysis.issues} />
                  <AnalysisList title="Recommendations" items={analysis.recommendations} />
                  <AnalysisList title="Follow-up points" items={analysis.followUpPoints} />
                  {analysis.riskFlags.length > 0 && <div className="small">Flags: {analysis.riskFlags.join(', ')}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
