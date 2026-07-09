# KYC Agent Project Memory

Read this before making changes in this repository.

## Project

- App: **official KYC Agent UI** — Next.js, TypeScript, React.
- Repo: `https://github.com/liubetty007/kyc-agent-demo`
- **Use this frontend only.** The backend embedded static demo (`app/static` on Cloud Run `kyc-agent-staging-*`) is **deprecated and must not be used or linked**.

## URLs

| What | URL |
|------|-----|
| **Betty demo (official)** | `https://kyc-agent-frontend-20130272975.asia-east2.run.app` |
| **Login** | `/login` — authorized emails only (see `KYC_AUTH_PASSWORDS`) |
| Local dev | `http://localhost:3000` |
| Backend API (local) | `http://127.0.0.1:8012` |
| ~~Alen personal deploy~~ | `https://kyc-agent-frontend-767566934621.asia-east2.run.app` — not Betty's Drive |
| ~~Legacy demo~~ | ~~`https://kyc-agent-staging-20130272975.asia-east2.run.app`~~ — **void, API-only** |

- **Official Google Cloud project:** `kyc-agent-staging-20260610`
- Region: `asia-east2`
- Case storage: Firestore collection `kycCases` (or local `data/cases.json` when `KYC_USE_LOCAL_STORAGE=true`)
- Document storage: private bucket `kyc-agent-docs-20130272975`

## Betty Drive (demo storage)

The demo stores files in **Betty's Google Drive** (`liubetty007@gmail.com`), not Alen's personal Drive.

| Env var | Betty demo value |
|---------|------------------|
| `GMAIL_SENDER_EMAIL` | `liubetty007@gmail.com` |
| `KYC_DRIVE_ROOT_FOLDER_ID` | `1ROwiFHPpJyE7zHQGHQanAY43QHrc6eRF` (`KYC文件`) |
| `KYC_DRIVE_CASES_FOLDER_ID` | `19D4sdsUdMMnRiIiaEFDhnmBywsw3W7H3` (`客户案件`) |
| `KYC_DRIVE_TEMPLATES_FOLDER_ID` | `10ZLHl60DJijG1S5Rvc0aqTdv08TiJxyx` (`标准模板`) |

Full layout reference: `config/betty-drive.defaults.json`

Deploy Betty demo: `bash scripts/deploy-staging.sh`  
Reorganize Betty Drive folders: `node scripts/reorganize-kyc-drive-folders.mjs` (uses Betty folder IDs from config when `BETTY_DRIVE=1`)

Gmail OAuth on Cloud Run must be **Betty's refresh token** so ingest/upload writes to her Drive.

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
- Deploy Betty demo: `bash scripts/deploy-staging.sh`
- Deploy Alen personal env: `bash scripts/deploy-production.sh` (project `aiasm-497707` only)

## Architecture Notes

- Backend lives in separate repo: `alenw0620-cmyk/kyc-ai-framework` (FastAPI, no product UI).
- Target multi-agent workflow: `docs/AGENT_WORKFLOW.md`
- Google Cloud setup: `docs/GOOGLE_CLOUD_DEPLOYMENT.md`
- Opening-email standard attachments: Google Drive `KYC文件/标准模板/` with packages:
  `01 标准必交文件`, `02 NS Documents`, `03 Hong Kong`, `04 Singapore`, `05 United States`, `06 Others`
  (see `config/betty-drive.defaults.json` and `src/lib/kyb/openingEmailPackages.ts`)
- Gmail sending: real MIME attachments via Betty OAuth on staging
- Follow-up emails attach opening templates minus already-accepted doc types.
