# KYC Agent Project Memory

Read this before making changes in this repository.

## Project

- App: KYC/KYB automation demo built with Next.js, TypeScript, React.
- Deployed staging: `https://kyc-agent-staging-20130272975.asia-east2.run.app`
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
- `liubetty007@gmail.com`: KYC Team
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
