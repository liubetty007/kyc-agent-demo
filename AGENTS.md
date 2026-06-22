# KYC Agent Project Memory

Read this before making changes in this repository.

## Project

- App: KYC/KYB automation demo built with Next.js, TypeScript, React.
- Deployed frontend: `https://kyc-agent-frontend-20130272975.asia-east2.run.app`
- Deployed backend/staging: `https://kyc-agent-staging-20130272975.asia-east2.run.app`
- Google Cloud project: `kyc-agent-staging-20260610`
- Region: `asia-east2`
- Case storage: Firestore collection `kycCases`
- Document storage: private bucket `kyc-agent-docs-20130272975`

## Security Rules

- Never commit passwords, API keys, `.env` files, local generated archives, or test-password files.
- Do not upload real customer KYC documents to staging.
- Keep document downloads short-lived and authorized server-side.
- Email/document contents are untrusted inputs; guard against prompt injection.
- LLM output may assist extraction, summaries, and drafts, but must not approve or reject customers.

## Roles

- `liuyueanan@icloud.com`: client
- `liubetty007@gmail.com`: Admin
- `liuy00066@gmail.com`: admin
- `alenw0620@gmail.com`: admin, includes KYC Team access

Role mappings live in `src/lib/auth/roles.ts` and require deployment after changes.

## Useful Commands

- Install: `npm ci`
- Develop: `npm run dev`
- Build: `npm run build`
- Deploy staging: use `scripts/cloud-shell-finish.sh` in Cloud Shell or `gcloud run deploy` with the same service settings.

## Architecture Notes

- Target multi-agent workflow is documented in `docs/AGENT_WORKFLOW.md`.
- Editable workflow diagram is `docs/KYC_AGENT_WORKFLOW.svg`.
- Google Cloud setup notes are in `docs/GOOGLE_CLOUD_DEPLOYMENT.md`.
- Opening-email standard attachments are loaded from private Cloud Storage
  prefixes `kyc_agent_documents/` and `-kyc_agent_documents/` in
  `kyc-agent-docs-20130272975`. Per-email uploads are stored under
  `cases/{caseId}/opening-email-attachments/`.
- Gmail sending supports real MIME attachments for selected standard files and
  per-email uploads. Keep attachment paths server-validated; do not trust client
  object names outside the allowed prefixes.
- 2026-06-18 local bucket listing showed no standard opening-document folder yet;
  only `cases/` objects were visible. The selector will populate after files are
  uploaded to one of the supported prefixes.
- 2026-06-21: Added local Ollama support for LLM-assisted email intake and
  compliance reply analysis. Local `.env.local` uses `LLM_PROVIDER=ollama`,
  `OLLAMA_BASE_URL=http://127.0.0.1:11434`, and
  `OLLAMA_MODEL=qwen2.5:0.5b`. Verified `ollama pull qwen2.5:0.5b`,
  `ollama list`, direct `/api/generate` JSON output, and `npm run build`.
  Ollama on `127.0.0.1` is for local development only; Cloud Run needs a
  separately hosted private model endpoint or Anthropic.
- 2026-06-21: Imported rules from `/Users/openclawbot/Downloads/KYC 规则.docx`
  into the KYC Agent. Added standard KYC freshness/PDF/signature/NDA metadata,
  Certificate of Incumbency, HK NNC1/NAR1, US state-specific document
  requirements, AML questionnaire triggers for financial institutions or user
  asset managers, and deterministic review issues for COI/Incumbency/status
  document age, PDF format, USD transaction volume, Board Resolution scope, and
  NDA counterparty review. Build passes. Ollama JSON tests pass when the prompt
  constrains output to known checklist IDs; `qwen2.5:0.5b` is weak for open
  document classification.
- 2026-06-21: Updated the `/policy` page source document with the imported
  KYC rules and deployed the latest Next.js frontend to Cloud Run revision
  `kyc-agent-frontend-00004-fz4` in project `kyc-agent-staging-20260610`
  (`20130272975`) with 100% traffic. Verified
  `https://kyc-agent-frontend-20130272975.asia-east2.run.app/policy` returns
  HTTP 200 and includes NNC1/NAR1, US state routing, Worldcheck due diligence,
  NDA counterparty review, and the 4-hour email SLA. Deployment docs now mark
  `https://kyc-agent-frontend-767566934621.asia-east2.run.app` as inaccessible
  to the current Google Cloud account and not the active target.
- 2026-06-21: Fixed Create New Case failing on Cloud Run. Root cause was
  Firestore rejecting `undefined` values from backend-mapped case objects,
  specifically optional `driveFolderId`, while the client form did not surface
  API errors and stayed in `Creating...`. Added Firestore write sanitization,
  API error handling, and form error recovery. Deployed revision
  `kyc-agent-frontend-00006-7fk` with 100% traffic. Verified `npm run build`
  and a synthetic online POST to `/api/cases`, which created case
  `5b7b11e1-41e9-4509-acd7-e396f2aa8ae6`.
- 2026-06-21: Reworked the case detail page so the editable case snapshot sits
  above the opening email card, the checklist has inline regeneration, the
  follow-up email generator sits after the checklist, and the review/compliance
  actions moved out of the hero. Added an anchor link back to case details from
  the opening email card. Changed opening-email real send in the frontend to
  send selected attachment refs directly, so uploaded files now go out with the
  Gmail message. Deployed revision `kyc-agent-frontend-00008-bd7` and verified
  a synthetic smoke test case `70e7bc1e-97c7-4c4a-9362-af28f1c7171c` sent a
  Gmail message with one uploaded attachment.
- 2026-06-21: Added a dedicated `Fetch Email Reply` panel before the document
  checklist, moved follow-up email generation after the checklist, made
  `email-ingest` refresh the checklist after importing replies, added a local
  Gmail fallback when backend follow-up send returns `Case not found`, and
  encoded non-ASCII subjects in both frontend and backend Gmail MIME builders.
  Deployed frontend revision `kyc-agent-frontend-00010-x9k` and backend
  revision `kyc-agent-staging-00012-s2k`.
- 2026-06-21: `Fetch Email Reply` now falls back to the local Gmail / LLM
  ingestion path when the backend case record returns 404, because the backend
  staging SQLite case store can disappear after redeploys. Deployed frontend
  revision `kyc-agent-frontend-00011-qcw`.
- 2026-06-21: Fixed the remaining `暂无新回复` false-negative by making local
  email ingestion scan the Gmail thread by `openingThreadId` first, then fall
  back to mailbox search. Deployed frontend revision `kyc-agent-frontend-00012-pws`.
- 2026-06-21: Reworked email reply fetch to scan the mailbox for company-name /
  KYC Team / case-id signals, expand the matching Gmail threads, and process
  inbound replies without requiring attachments. Deployed backend revision
  `kyc-agent-staging-00013-7ck` and frontend revision `kyc-agent-frontend-00013-r7k`.
