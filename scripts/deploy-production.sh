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
DEFAULT_PASSWORD="${KYC_DEFAULT_PASSWORD:-1234}"
AUTH_USERS="${KYC_AUTH_USERS:-alenw0620@gmail.com,liubetty007@gmail.com,kexin.li@antalpha.com,aaron.pang@antalpha.com}"
SESSION_SECRET="${KYC_SESSION_SECRET:-$(openssl rand -base64 32)}"

IFS=',' read -r -a USER_ARRAY <<< "$AUTH_USERS"
AUTH_PASSWORDS=""
for EMAIL in "${USER_ARRAY[@]}"; do
  EMAIL="$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
  [[ -z "$EMAIL" ]] && continue
  if [[ -n "$AUTH_PASSWORDS" ]]; then AUTH_PASSWORDS+=","; fi
  AUTH_PASSWORDS+="${EMAIL}:${DEFAULT_PASSWORD}"
done

echo "==> Project: $PROJECT_ID | Service: $SERVICE | Region: $REGION"

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
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

echo "==> Deploying Cloud Run service..."
ENV_FILE="$(mktemp)"
cat >"$ENV_FILE" <<EOF
GOOGLE_CLOUD_PROJECT: ${PROJECT_ID}
KYC_DOCUMENT_BUCKET: ${BUCKET}
KYC_SESSION_SECRET: ${SESSION_SECRET}
KYC_AUTH_PASSWORDS: ${AUTH_PASSWORDS}
GMAIL_SENDER_EMAIL: ${GMAIL_SENDER_EMAIL}
KYC_TEAM_EMAIL: ${KYC_TEAM_EMAIL}
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
  --env-vars-file="$ENV_FILE" \
  --quiet

gcloud run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --remove-env-vars="KYC_DEV_BYPASS_AUTH,KYC_USE_LOCAL_STORAGE,FIREBASE_API_KEY" \
  --quiet

rm -f "$ENV_FILE"

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"

printf '\n✓ Deployment complete\n'
printf 'URL: %s\n' "$SERVICE_URL"
printf 'Login: %s/login\n' "$SERVICE_URL"
printf 'Authorized users: %s\n' "$AUTH_USERS"
printf 'Password: %s\n' "$DEFAULT_PASSWORD"
