import { extractNewReplyText } from './complianceReplyText';
import { inferComplianceOutcomeFromText, outcomeForAutomaticComplianceHandling } from './complianceOutcome';
import type { ComplianceReplyAnalysis } from './types';

const HIGH_RISK_PATTERN = /高风险|high risk|sanction|制裁|拒绝|reject|not approved|cannot proceed|edd|加强尽职|重大/i;
const MEDIUM_RISK_PATTERN = /medium risk|中风险|补充|缺失|missing|provide|clarif|需提供|待补|request more|follow[- ]?up/i;
const LOW_RISK_PATTERN = /low risk|低风险|approved|approve|通过|可以开户|同意开户|no material issue|no issue/i;

function riskLevelFromText(text: string): ComplianceReplyAnalysis['riskLevel'] {
  if (!text.trim()) return 'unclear';
  if (HIGH_RISK_PATTERN.test(text)) return 'high';
  if (MEDIUM_RISK_PATTERN.test(text)) return 'medium';
  if (LOW_RISK_PATTERN.test(text)) return 'low';
  return 'unclear';
}

function recommendedAction(outcome: ComplianceReplyAnalysis['outcome'], riskLevel: ComplianceReplyAnalysis['riskLevel']): string {
  if (outcome === 'approved') return 'Proceed with account opening after KYC confirms no operational blockers remain.';
  if (outcome === 'rejected') return 'Do not proceed. Record the rejection rationale and notify the client if appropriate.';
  if (outcome === 'edd_required') return 'Escalate for EDD and collect the enhanced due diligence items requested by Compliance.';
  if (outcome === 'request_more_info') return 'Ask the client for the additional documents or clarification requested by Compliance.';
  if (riskLevel === 'high') return 'Escalate to senior KYC/Compliance reviewer before responding to the client.';
  return 'Human review required before taking the next workflow action.';
}

function evidenceLines(text: string): string[] {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^>+\s*/, '').trim())
    .filter(Boolean);
  return lines.slice(0, 4);
}

export function analyzeComplianceReplyText(text: string): ComplianceReplyAnalysis {
  const stripped = extractNewReplyText(text);
  const working = stripped || text;
  const inferred = inferComplianceOutcomeFromText(working);
  const outcome = inferred === 'unclear' ? 'unclear' : outcomeForAutomaticComplianceHandling(inferred, working);
  const riskLevel = riskLevelFromText(working);
  const summary = working.trim()
    ? working.replace(/\s+/g, ' ').trim().slice(0, 280)
    : 'No readable compliance reply content was found.';

  return {
    outcome,
    riskLevel,
    summary,
    evidence: evidenceLines(working),
    recommendedAction: recommendedAction(outcome, riskLevel),
  };
}
