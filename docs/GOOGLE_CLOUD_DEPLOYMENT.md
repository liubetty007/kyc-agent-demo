# Google Cloud Deployment

The staging architecture uses Cloud Run, Firestore, private Cloud Storage,
Firebase Authentication, Secret Manager, and Cloud Audit Logs.

## Authorized roles

| Email | Role |
| --- | --- |
| `liuyueanan@icloud.com` | Client |
| `liubetty007@gmail.com` | Admin |
| `liuy00066@gmail.com` | Admin |
| `alenw0620@gmail.com` | Admin (includes KYC Team access) |

Roles are enforced in `src/lib/auth/roles.ts`. The client can only access a
case whose `contactEmail` matches the signed-in email.

## Required environment

- `GOOGLE_CLOUD_PROJECT`
- `KYC_DOCUMENT_BUCKET`
- `FIREBASE_API_KEY`
- `ANTHROPIC_API_KEY` through Secret Manager when cloud AI drafting is enabled
- `ANTHROPIC_MODEL` such as `claude-sonnet-4-5`
- Optional local development only: `LLM_PROVIDER=ollama`,
  `OLLAMA_BASE_URL=http://127.0.0.1:11434`, and `OLLAMA_MODEL=qwen2.5:0.5b`
- Optional company OpenAI-compatible vision model:
  `LLM_PROVIDER=newapi`,
  `NEWAPI_BASE_URL=https://newapi.elevatesphere.com/v1`,
  `NEWAPI_MODEL=qwen3-vl-235b-a22b-instruct-fp8`, and Secret Manager value
  `NEWAPI_API_KEY`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_SENDER_EMAIL`
- `KYC_TEAM_EMAIL`

## Security defaults

- The document bucket must have public access prevention and uniform
  bucket-level access enabled.
- Browser users never receive bucket IAM permissions.
- Downloads are authorized by the application and use five-minute signed URLs.
- Cloud Run uses a dedicated service account with only Firestore and object
  access required by this application.
- Real customer documents must not be used until retention, deletion, malware
  scanning, audit review, and privacy requirements are approved.

## Staging resources

- Project: `kyc-agent-staging-20260610`
- Region: `asia-east2` (Hong Kong)
- Document bucket: `kyc-agent-docs-20130272975`
- Cloud Run service account:
  `kyc-agent-runner@kyc-agent-staging-20260610.iam.gserviceaccount.com`
- Idempotent base setup: `scripts/deploy-gcp.sh`
- Cloud Shell authentication and deployment: `scripts/cloud-shell-finish.sh`

Current frontend URL (latest Next.js UI):

- `https://kyc-agent-frontend-20130272975.asia-east2.run.app`

Note: `https://kyc-agent-frontend-767566934621.asia-east2.run.app` belongs to a
Google Cloud project that is not visible to `liubetty007@gmail.com`; deploy the
current repository to project `kyc-agent-staging-20260610` instead.

Legacy staging URL (backend framework demo only — not the KYC Agent UI):

- `https://kyc-agent-staging-20130272975.asia-east2.run.app`

Do not commit generated test passwords, API keys, `.env` files, local Cloud
Shell archives, `.vercel`, `.next`, or `data/cases.json`.

## Gmail and LLM integration

The application now supports real Gmail intake when Gmail OAuth variables are
configured. Without those variables it falls back to demo mailbox ingestion.

Required Gmail OAuth scope:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/drive`

Recommended setup:

1. Create an OAuth client in Google Cloud for the KYC mailbox operator.
2. Authorize the KYC Gmail account with both Gmail and Drive scopes, then store
   the refresh token in Secret Manager or Cloud Run environment variables.
3. Set `GMAIL_SENDER_EMAIL` to the mailbox that sends opening/follow-up emails.
4. Configure one LLM provider:
   - `LLM_PROVIDER=newapi` with `NEWAPI_API_KEY` for the company
     OpenAI-compatible Qwen3-VL model.
   - `LLM_PROVIDER=ollama` for the Cloud Run Ollama service.
   - `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` for Claude.
5. Keep KYC Team approval before external sends and document acceptance.

Document analysis conversion:

- Image files (`png`, `jpg`, `jpeg`, `webp`, `gif`, `bmp`) are sent to the
  vision model as `image_url` data URLs.
- PDF, DOCX, XLSX, TXT, CSV, JSON, XML, Markdown, and HTML are converted to
  article text before analysis.
- Scanned PDFs without embedded text require OCR/page rendering before the
  model can read them. The current converter reports this as a conversion
  warning instead of silently returning a blank analysis.

Ollama note:

- `127.0.0.1` points to the runtime container. It works for local `npm run dev`
  when Ollama runs on the same machine, but not for Cloud Run unless you provide
  a separately hosted, private Ollama endpoint.

Helper scripts:

- Generate a Gmail refresh token locally:
  `GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/gmail-oauth-token.mjs`
  Use `OAUTH_SCOPES` to override the default Gmail + Drive scopes if needed.
- Store secrets and update Cloud Run:
  `./scripts/configure-real-email-secrets.sh`
- Configure the company NewAPI/Qwen3-VL model for document analysis:
  `NEWAPI_API_KEY=... ./scripts/configure-newapi-llm.sh`

Inbound Gmail sync:

- KYC/Admin clicks **Fetch & Analyze Gmail** on a case.
- Gmail is searched by case ID, company name, and client sender.
- New messages are imported into the case timeline.
- Attachments are stored in the private document bucket.
- Email Intake Agent extracts intent, keywords, entities, attachment type,
  confidence, and human-review requirements.
