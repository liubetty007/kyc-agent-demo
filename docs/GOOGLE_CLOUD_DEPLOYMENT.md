# Google Cloud Deployment

The staging architecture uses Cloud Run, Firestore, private Cloud Storage,
Firebase Authentication, Secret Manager, and Cloud Audit Logs.

## Authorized roles

| Email | Role |
| --- | --- |
| `liuyueanan@icloud.com` | Client |
| `liubetty007@gmail.com` | KYC Team |
| `liuy00066@gmail.com` | Admin |
| `alenw0620@gmail.com` | Admin (includes KYC Team access) |

Roles are enforced in `src/lib/auth/roles.ts`. The client can only access a
case whose `contactEmail` matches the signed-in email.

## Required environment

- `GOOGLE_CLOUD_PROJECT`
- `KYC_DOCUMENT_BUCKET`
- `FIREBASE_API_KEY`
- `ANTHROPIC_API_KEY` through Secret Manager when AI drafting is enabled

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

Current staging URL:

- `https://kyc-agent-staging-20130272975.asia-east2.run.app`

Do not commit generated test passwords, API keys, `.env` files, local Cloud
Shell archives, `.vercel`, `.next`, or `data/cases.json`.
