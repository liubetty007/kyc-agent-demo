#!/usr/bin/env bash
# Personal / Antalpha Cloud Run deploy (aiasm-497707).
# For the official Betty demo, use scripts/deploy-staging.sh instead.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="${PROJECT_ID:-aiasm-497707}"
REGION="${REGION:-asia-east2}"
SERVICE="${SERVICE:-kyc-agent-frontend}"
BUCKET="${BUCKET:-kyc-agent-docs-767566934621}"
FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"

echo "==> Project: $PROJECT_ID | Service: $SERVICE | Region: $REGION"

if [[ -z "$FIREBASE_API_KEY" ]]; then
  echo "ERROR: FIREBASE_API_KEY is required for Identity Platform password login." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  --quiet

if ! gcloud firestore databases describe --database='(default)' --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database='(default)' \
    --location="$REGION" \
    --type=firestore-native \
    --project="$PROJECT_ID" \
    --quiet
fi

if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention
fi

GMAIL_SENDER_EMAIL="${GMAIL_SENDER_EMAIL:-alenw0620@gmail.com}"
KYC_TEAM_EMAIL="${KYC_TEAM_EMAIL:-$GMAIL_SENDER_EMAIL}"
KYC_DRIVE_ROOT_FOLDER_ID="${KYC_DRIVE_ROOT_FOLDER_ID:-1ROwiFHPpJyE7zHQGHQanAY43QHrc6eRF}"
KYC_DRIVE_CASES_FOLDER_ID="${KYC_DRIVE_CASES_FOLDER_ID:-19D4sdsUdMMnRiIiaEFDhnmBywsw3W7H3}"
KYC_DRIVE_TEMPLATES_FOLDER_ID="${KYC_DRIVE_TEMPLATES_FOLDER_ID:-10ZLHl60DJijG1S5Rvc0aqTdv08TiJxyx}"
KYC_STANDARD_DRIVE_FOLDER_ID="${KYC_STANDARD_DRIVE_FOLDER_ID:-${KYC_DRIVE_TEMPLATES_FOLDER_ID}}"

echo "==> Deploying Cloud Run service..."
ENV_FILE="$(mktemp)"
cat >"$ENV_FILE" <<EOF
GOOGLE_CLOUD_PROJECT: ${PROJECT_ID}
KYC_DOCUMENT_BUCKET: ${BUCKET}
GMAIL_SENDER_EMAIL: ${GMAIL_SENDER_EMAIL}
KYC_TEAM_EMAIL: ${KYC_TEAM_EMAIL}
KYC_DRIVE_ROOT_FOLDER_ID: ${KYC_DRIVE_ROOT_FOLDER_ID}
KYC_DRIVE_CASES_FOLDER_ID: ${KYC_DRIVE_CASES_FOLDER_ID}
KYC_DRIVE_TEMPLATES_FOLDER_ID: ${KYC_DRIVE_TEMPLATES_FOLDER_ID}
KYC_STANDARD_DRIVE_FOLDER_ID: ${KYC_STANDARD_DRIVE_FOLDER_ID}
FIREBASE_API_KEY: ${FIREBASE_API_KEY}
NODE_ENV: production
EOF

gcloud run deploy "$SERVICE" \
  --source=. \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=3 \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80 \
  --quiet

gcloud run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --env-vars-file="$ENV_FILE" \
  --update-secrets=GMAIL_CLIENT_ID=gmail-client-id:latest,GMAIL_CLIENT_SECRET=gmail-client-secret:latest,GMAIL_REFRESH_TOKEN=gmail-refresh-token:latest \
  --remove-secrets=KYC_SESSION_SECRET,KYC_AUTH_PASSWORDS_JSON \
  --quiet

rm -f "$ENV_FILE"

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"

printf '\n✓ Deployment complete\n'
printf 'URL: %s\n' "$SERVICE_URL"
printf 'Login: %s/login\n' "$SERVICE_URL"
