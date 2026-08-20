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
| `kexin.li@antalpha.com` | Admin |
| `aaron.pang@antalpha.com` | Admin |

Roles are enforced in `src/lib/auth/roles.ts`. The client can only access a
case whose `contactEmail` matches the signed-in email.

## Required environment and secrets

- `GOOGLE_CLOUD_PROJECT`
- `KYC_DOCUMENT_BUCKET`
- `FIREBASE_API_KEY` for email/password sign-in through Firebase
  Authentication / Identity Platform
- Production document analysis: `LLM_PROVIDER=newapi`,
  `NEWAPI_BASE_URL=https://newapi.elevatesphere.com/v1`,
  `NEWAPI_MODEL=gpustack-minimax-m2.7`, and Secret Manager secret
  `newapi-api-key` bound as `NEWAPI_API_KEY`
- PaddleOCR preprocessing: `PADDLEOCR_BASE_URL` for a private service,
  `PADDLEOCR_AUTH_MODE=google_id_token`, and `PADDLEOCR_REQUIRED=true`
- Optional local development: use `LLM_PROVIDER=ollama` with
  `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- Optional Claude fallback: `ANTHROPIC_API_KEY` through Secret Manager and
  `ANTHROPIC_MODEL` such as `claude-sonnet-4-5`
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
- The browser exchanges a recent, verified Identity Platform ID token for an
  eight-hour HttpOnly, Secure, SameSite session cookie. The ID token is kept in
  memory only and is cleared immediately after the exchange.
- Every protected page and API verifies the Firebase session cookie and the
  server-side email/role allowlist; middleware cookie checks are not treated as
  an authorization boundary.
- Staging uses administrator-provisioned, strong unique passwords without MFA.
  Enable MFA only after every allowlisted user has a tested enrollment and
  recovery path.
- Uploads are size-limited and checked by MIME type, filename extension, and
  file signature before storage or document parsing.
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
- Legacy Firebase-compatible Cloud Shell deployment: `scripts/cloud-shell-finish.sh`

Current frontend URL (Betty demo — latest Next.js UI):

- `https://kyc-agent-frontend-20130272975.asia-east2.run.app`

Deploy: `bash scripts/deploy-staging.sh` on project `kyc-agent-staging-20260610`.  
Gmail/Drive OAuth on that service must be **Betty's** refresh token (`liubetty007@gmail.com`) so files use her `KYC文件` Drive. See `config/betty-drive.defaults.json`.

## Automatic deployment from GitHub

The `CI` workflow deploys a new Cloud Run revision after the workflow tests and
Next.js build pass on `main`. The deployment sends the checked-out source to
Cloud Build and updates `kyc-agent-frontend`; it intentionally does not pass
environment variables or Secret Manager bindings, so the service's existing
login, Gmail/Drive, OCR, and LLM configuration is preserved.

The deployment uses GitHub OIDC and Google Workload Identity Federation. No
Google service-account JSON key is created or stored in GitHub. The provider is
restricted to all of the following immutable or exact claims:

- GitHub repository ID `1271046505` (`liubetty007/kyc-agent-demo`)
- GitHub owner ID `294129570`
- branch `refs/heads/main`
- workflow `liubetty007/kyc-agent-demo/.github/workflows/ci.yml@refs/heads/main`

Run the one-time, idempotent GCP setup as a project administrator:

```bash
bash scripts/setup-github-actions-deploy.sh
```

After IAM changes propagate, pushing to `main` runs build, workflow tests,
deployment, and a public `/login` smoke check. A failed build never reaches the
deployment job, and concurrent deployments are serialized. The workflow does
not change the Cloud Run public-access IAM policy.

The deployer has `iam.serviceAccountUser` only on the application's runtime
service account and Cloud Build's default build service account. The latter is
required for `gcloud run deploy --source`; it does not grant access to other
service accounts.

Before the first deployment, enable Email/Password in Identity Platform, create
a Firebase Web app, and pass its API key as `FIREBASE_API_KEY` to the deployment
script. Provision only allowlisted users, mark administrator-verified addresses
as verified, and assign strong unique passwords outside source control.

Note: `https://kyc-agent-frontend-767566934621.asia-east2.run.app` is a separate personal project (`aiasm-497707`) and does **not** use Betty's Drive.

Legacy backend URL (framework demo only — not the KYC Agent UI):

- `https://kyc-agent-staging-20130272975.asia-east2.run.app`

Do not commit generated test passwords, API keys, `.env` files, local Cloud
Shell archives, `.vercel`, `.next`, or `data/cases.json`.

## Gmail and LLM integration

The application now supports real Gmail intake when Gmail OAuth variables are
configured. Without those variables it falls back to demo mailbox ingestion.

Required Gmail OAuth scope:

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/drive.file`

Recommended setup:

1. Create an OAuth client in Google Cloud for the KYC mailbox operator.
2. Authorize the KYC Gmail account with both Gmail and Drive scopes, then store
   the refresh token in Secret Manager or Cloud Run environment variables.
3. Set `GMAIL_SENDER_EMAIL` to the mailbox that sends opening/follow-up emails.
4. Configure one LLM provider:
   - Production: `LLM_PROVIDER=newapi` with `NEWAPI_API_KEY` for the company
     OpenAI-compatible MiniMax model.
   - Local development: `LLM_PROVIDER=ollama` for a local Ollama service.
   - `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` for Claude.
5. Keep KYC Team approval before external sends and document acceptance.

Document analysis conversion (full configuration and security boundary:
`docs/PADDLEOCR_MINIMAX_ANALYSIS.md`):

- Image files and PDFs are sent to private PaddleOCR first. Only normalized,
  length-limited OCR text is sent to MiniMax.
- PDF, DOCX, XLSX, TXT, CSV, JSON, XML, Markdown, and HTML are converted to
  article text before analysis; PDF/image OCR uses the PaddleOCR result.
- With `PADDLEOCR_REQUIRED=true`, an OCR failure stops MiniMax analysis instead
  of silently sending the original image or returning an unsupported result.

Ollama note:

- `127.0.0.1` points to the runtime container. It works for local `npm run dev`
  when Ollama runs on the same machine. Betty's Cloud Run deployment instead
  uses the separately hosted private `kyc-ollama-llm` service and authenticates
  with the frontend service account's Google ID token.

Helper scripts:

- Generate a Gmail refresh token locally:
  `GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/gmail-oauth-token.mjs`
  Use `OAUTH_SCOPES` to override the default Gmail + Drive scopes if needed.
- Reauthorize Gmail/Drive and write the new refresh token directly to Secret
  Manager without printing it:
  `node scripts/reauthorize-google-oauth.mjs`
- Store secrets and update Cloud Run:
  `./scripts/configure-real-email-secrets.sh`
- Configure the company PaddleOCR/NewAPI MiniMax chain for document analysis:
  `NEWAPI_API_KEY=... ./scripts/configure-newapi-llm.sh`

Inbound Gmail sync:

- KYC/Admin clicks **Fetch & Analyze Gmail** on a case.
- Gmail is searched by case ID, company name, and client sender.
- New messages are imported into the case timeline.
- Attachments are stored in the private document bucket.
- Email Intake Agent extracts intent, keywords, entities, attachment type,
  confidence, and human-review requirements.
