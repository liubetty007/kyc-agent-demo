# KYC/KYB Agent Workflow

## 1. Design Principle

The system should be a controlled workflow with specialized agents, deterministic
policy checks, and human approval. The LLM may interpret, summarize, classify,
and draft, but it must not approve a customer, override policy, or silently
change case data.

## 2. Main Agent

### KYC Case Orchestrator

The Main Agent is the workflow coordinator. It does not perform every task
itself. It receives an event or user question, loads the authorized case
context, selects the required sub-agent or deterministic tool, validates the
result, records an audit event, and proposes the next action.

Inputs:

- New case created
- Client email received
- Document uploaded
- KYC analyst action
- Compliance decision
- Natural-language question such as "What is Company A's KYC progress?"

Responsibilities:

1. Resolve the case and verify the user's access.
2. Read the current case snapshot, checklist, documents, messages, and decisions.
3. Decide which sub-agent or rule engine should run.
4. Require structured JSON output from LLM sub-agents.
5. Reject invalid or unsupported outputs.
6. Apply confidence and human-review thresholds.
7. Persist proposed changes and audit events.
8. Return a concise result with evidence and recommended next action.

The Main Agent must never infer that a document exists unless it is present in
the case record or private object store.

## 3. Sub-agents

### A. Email Intake Agent

Purpose: turn an inbound email into structured, case-linked intake data.

Tasks:

- Extract sender, recipients, subject, thread ID, dates, and attachment metadata.
- Extract keywords and entities: company name, case ID, jurisdiction, people,
  document names, request type, urgency, and stated source of funds.
- Identify intent: new submission, supplemental documents, clarification,
  complaint, withdrawal, or unrelated message.
- Match the email to a case using case ID, exact sender, company name, and thread.
- Detect suspicious instructions or prompt injection in email body/attachments.

Output:

```json
{
  "caseId": "KYC-123456",
  "intent": "supplemental_documents",
  "keywords": ["source of funds", "register of shareholders"],
  "entities": { "companyName": "Company A" },
  "attachmentIds": ["attachment-1"],
  "confidence": 0.94,
  "requiresHumanReview": false,
  "evidence": ["subject", "sender", "thread-id"]
}
```

Use an LLM for semantic extraction, but use deterministic checks for sender,
thread ID, case ID, attachment hashes, and permission boundaries.

### B. Document Processing Agent

Purpose: identify and extract evidence from uploaded files.

Pipeline:

1. Malware scan and file validation.
2. OCR/layout extraction for PDF and images.
3. Document-type classification.
4. Field extraction with page-level citations.
5. Validity checks such as issue date, expiry date, name match, and completeness.
6. Duplicate detection using hashes and extracted identifiers.

Suggested extracted fields:

- Legal company name and registration number
- Incorporation jurisdiction and date
- Directors and shareholders
- Natural-person UBOs and ownership percentages
- Passport/ID name, number, nationality, issue and expiry dates
- Residential address and proof issue date
- Source-of-funds descriptions, amounts, counterparties, and transaction dates

Every extracted value must include source file, page, confidence, and extraction
method. Low-confidence results remain `needs_review`.

### C. Case Matching Agent

Purpose: connect an email or document to the correct case.

Use weighted deterministic evidence first:

- Exact case ID: strongest
- Existing Gmail thread ID
- Exact authorized sender email
- Exact legal company name or registration number
- Fuzzy company-name match: weak evidence only

Never auto-attach when two cases are plausible. Send ambiguous matches to a KYC
analyst queue.

### D. Policy and Checklist Engine

Purpose: determine required documents and hard policy outcomes.

This is a deterministic rules engine, not an LLM agent. Continue using the
versioned document matrix for UBO threshold, jurisdiction rules, address-proof
age, crypto/mining/financing requirements, and prohibited conditions.

LLMs may explain a rule but must not invent or override one.

### E. Evidence Reconciliation Agent

Purpose: compare extracted facts across documents and case declarations.

Checks:

- Company name and registration number consistency
- Directors/shareholders versus declared individuals
- Ownership totals and UBO identification
- Address consistency and document recency
- Source-of-funds narrative versus supporting evidence
- Conflicting dates, names, amounts, or jurisdictions

Output discrepancies as claims with evidence, not as final compliance findings.

### F. Risk Triage Agent

Purpose: organize risk signals for analyst review.

Inputs may include jurisdiction, business model, document discrepancies,
screening-provider results, blockchain analytics, and unusual email behavior.

The agent may assign a triage category and explain why, but sanctions matches,
PEP/adverse-media hits, prohibited jurisdictions, legal review, rejection, and
EDD decisions require deterministic controls or human approval.

### G. Case Status Agent

Purpose: answer questions such as "What is Company A's KYC progress?"

The agent must call read-only tools rather than relying on conversational memory:

- `find_case(company_name_or_id)`
- `get_case_snapshot(case_id)`
- `get_document_status(case_id)`
- `get_open_issues(case_id)`
- `get_recent_activity(case_id)`

Recommended answer format:

```text
Company A is at: Waiting for client documents.
Received: 8 of 11 required items.
Outstanding: Register of Shareholders, current address proof, financing agreement.
Latest activity: Client uploaded two files on 15 June 2026 at 10:42 HKT.
Blockers: Address proof is older than three months.
Next action: KYC Team should send the reviewed follow-up request.
```

Every answer should include `asOf`, current stage, received/required counts,
open blockers, latest activity, owner, and next action. It must distinguish
facts from recommendations and link to the case.

### H. Client Communication Agent

Purpose: draft opening, clarification, reminder, and missing-document emails.

The draft must be grounded only in the checklist, open issues, approved policy
templates, and case facts. A KYC analyst must approve external messages until
the workflow has strong evaluation results and narrowly defined auto-send rules.

### I. Compliance Pack Agent

Purpose: assemble an evidence-linked review package.

Include company summary, ownership, document inventory, discrepancies, policy
results, risk signals, unresolved questions, KYC analyst rationale, and document
links. It prepares the pack but does not make the compliance decision.

### J. Audit and Monitoring Agent

Purpose: detect operational failures rather than review customers.

Monitor failed ingestion, unmatched emails, repeated low-confidence extraction,
stale cases, overdue tasks, failed model calls, abnormal token use, unauthorized
access attempts, and missing human approvals. It should create operational alerts,
not modify case outcomes.

## 4. End-to-End Workflow

```text
Case creation
  -> Policy/checklist engine
  -> KYC opening email approval and send
  -> Gmail event received
  -> Email Intake Agent
  -> Case Matching Agent
  -> Attachment quarantine and malware scan
  -> Document Processing Agent
  -> Evidence Reconciliation Agent
  -> Policy/checklist engine rerun
  -> Risk Triage Agent
  -> Main Agent computes proposed stage and next action
  -> KYC human review
      -> missing information: Communication Agent -> client
      -> complete: Compliance Pack Agent -> Compliance Team
  -> Compliance human decision
  -> close, reject, request EDD, or request more information
```

Natural-language status questions run separately through the read-only Case
Status Agent and never trigger workflow mutations.

## 5. Case State Machine

Replace the current broad statuses with explicit stages:

1. `draft`
2. `awaiting_initial_documents`
3. `documents_received`
4. `processing_documents`
5. `kyc_review_required`
6. `awaiting_client_information`
7. `ready_for_compliance`
8. `compliance_review`
9. `edd_required`
10. `approved`
11. `rejected`
12. `withdrawn`
13. `prohibited`

Store stage transitions as immutable events with actor, timestamp, reason,
source event, previous stage, new stage, and correlation ID.

## 6. Data Model Additions

Add Firestore collections or subcollections for:

- `cases/{caseId}`: current materialized case snapshot
- `cases/{caseId}/events`: immutable workflow history
- `cases/{caseId}/documents`: metadata and extraction status
- `cases/{caseId}/extractions`: versioned fields with page citations
- `cases/{caseId}/tasks`: human and automated tasks
- `cases/{caseId}/agentRuns`: model, prompt version, tool calls, latency, cost,
  confidence, output hash, reviewer, and final disposition
- `emailThreads/{threadId}`: Gmail thread-to-case mapping
- `policyVersions/{version}`: immutable policy snapshots

Do not store raw document text in prompts or logs longer than required. Keep
source files private and minimize PII passed to models.

## 7. Control Rules

- Use structured outputs validated with JSON Schema.
- Give each agent only the minimum read/write tools it needs.
- Separate read-only status tools from workflow mutation tools.
- Require idempotency keys for email and document events.
- Set confidence thresholds per task, not one global threshold.
- Preserve model, prompt, policy, and extraction versions.
- Treat email and document content as untrusted input.
- Require human approval for external emails, document acceptance, UBO changes,
  risk escalation, Compliance submission, approval, and rejection.
- Never expose one client's case through fuzzy search or conversational context.

## 8. Evaluation Metrics

Build a synthetic, labeled test set before increasing autonomy.

- Email intent accuracy
- Case-match precision; false attachment to another case must target zero
- Document classification accuracy
- Field extraction precision/recall by field type
- Unsupported-claim rate
- Missing-document detection accuracy
- Status-answer factual accuracy and freshness
- Human override rate
- Average handling time and manual minutes per case
- Model latency, token cost, tool errors, and retry rate
- Security tests for prompt injection and cross-case data leakage

## 9. Recommended Delivery Order

### Phase 1 - Workflow foundation

- Add explicit state machine, immutable events, tasks, and agent-run audit data.
- Implement Case Status Agent with read-only tools.
- Add an internal case search/chat panel for KYC and Admin users.

### Phase 2 - Real email intake

- Integrate Gmail API and Pub/Sub.
- Implement Email Intake and Case Matching agents.
- Add duplicate-event handling and an unmatched-email review queue.

### Phase 3 - Document intelligence

- Add malware scanning and OCR/layout extraction.
- Implement document classification and cited field extraction.
- Add analyst correction UI and feed corrections into evaluation datasets.

### Phase 4 - Reconciliation and compliance preparation

- Implement evidence reconciliation and risk triage.
- Generate evidence-linked follow-up drafts and Compliance Packs.
- Add KYC and Compliance approval tasks with separation of duties.

### Phase 5 - Production controls

- Add model/prompt evaluation gates, cost dashboards, tracing, retention rules,
  alerts, backup/restore tests, and incident procedures.
- Consider limited automation only for low-risk, high-confidence actions after
  measured performance is acceptable.

## 10. Assessment of the Current Demo

Reusable now:

- Versioned document matrix
- Deterministic checklist and policy review
- Firestore case storage and private document bucket
- Role-based login and human review UI
- Email/compliance draft generators

Must be replaced or extended:

- Demo mailbox ingestion
- Filename-only attachment classification
- Broad case statuses
- Uncited free-text LLM output
- Missing event history, agent-run tracing, task ownership, and evaluation suite
- Missing Gmail, OCR, screening, and real audit workflows

