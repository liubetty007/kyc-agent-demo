# KYC Agent Project Memory

Read this before making changes in this repository.

## Project

- App: **official KYC Agent UI** — Next.js, TypeScript, React.
- Repo: `https://github.com/liubetty007/kyc-agent-demo`
- **Use this frontend only.** The backend embedded static demo (`app/static` on Cloud Run `kyc-agent-staging-*`) is **deprecated and must not be used or linked**.

## URLs

| What | URL |
|------|-----|
| **Frontend (use this)** | `https://kyc-agent-frontend-767566934621.asia-east2.run.app` |
| Local dev | `http://localhost:3000` |
| Backend API (local) | `http://127.0.0.1:8012` |
| ~~Legacy demo~~ | ~~`https://kyc-agent-staging-20130272975.asia-east2.run.app`~~ — **void, API-only** |

- Google Cloud project: `kyc-agent-staging-20260610`
- Region: `asia-east2`
- Case storage: Firestore collection `kycCases` (or local `data/cases.json` when `KYC_USE_LOCAL_STORAGE=true`)
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
- Develop: `npm run dev` (requires `.env.local` with `KYC_BACKEND_URL=http://127.0.0.1:8012`)
- Build: `npm run build`
- Deploy frontend: Cloud Run service `kyc-agent-frontend` (see `docs/GOOGLE_CLOUD_DEPLOYMENT.md`)

## Architecture Notes

- Backend lives in separate repo: `alenw0620-cmyk/kyc-ai-framework` (FastAPI, no product UI).
- Target multi-agent workflow: `docs/AGENT_WORKFLOW.md`
- Google Cloud setup: `docs/GOOGLE_CLOUD_DEPLOYMENT.md`
- Opening-email standard attachments: GCS prefixes `kyc_agent_documents/` and `-kyc_agent_documents/`
- Gmail sending: real MIME attachments via backend or frontend OAuth
- Follow-up emails attach opening templates minus already-accepted doc types.
