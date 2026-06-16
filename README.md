# KYC Agent

A fast local-first demo for corporate KYC onboarding automation.

## What it demonstrates

- Create a corporate KYC case
- Generate required document checklist from `config/kyb-document-matrix.json`
- Simulate received documents
- Run deterministic Agent review
- Generate missing item questions
- Generate client follow-up email draft
- Generate compliance pack summary
- Send real KYC emails through Gmail when OAuth is configured
- Fetch Gmail replies and attachments into the case timeline
- Use an LLM-backed Email Intake Agent for intent, keyword and attachment analysis

## Confirmed rules in this demo

- UBO = natural person with ownership percentage `>= 25%`
- Address proof must be issued within the last 3 months
- Mainland China is prohibited
- US requires state and legal review
- Europe / other countries require legal review
- HK requires Non-US Person & Non-solicitation in HK Confirmation
- Crypto wallet address is not mandatory by default; alternative evidence is accepted
- Mining proof is required for mining businesses
- Financing evidence is required when source of funds is financing

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Demo script

1. Open the dashboard.
2. Open `KYC-DEMO-HK` to show HK crypto missing documents and expired address proof.
3. Click **Run Agent Review**.
4. Click **Generate Email Draft**.
5. Click **Generate Compliance Pack**.
6. Create a new case with `Mainland China` to show prohibited jurisdiction.
7. Create a new US case without state to show legal review requirement.

## Data storage

Demo cases are stored in `data/cases.json` and are safe to reset/delete during testing.
When `GOOGLE_CLOUD_PROJECT` is configured, cases are stored in Firestore and
uploaded documents are stored in the private bucket named by
`KYC_DOCUMENT_BUCKET`. See `docs/GOOGLE_CLOUD_DEPLOYMENT.md`.

## Future expansion

Next priorities: Gmail Pub/Sub push notifications, OCR/PDF extraction, screening providers, chain analytics, richer RBAC, immutable audit logs, and a read-only Case Status Agent.
