#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
REGION="${REGION:-asia-east2}"
SERVICE="${SERVICE:-kyc-agent-staging}"
BUCKET="${BUCKET:-kyc-agent-docs-20130272975}"
SERVICE_ACCOUNT="kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  identitytoolkit.googleapis.com \
  securetoken.googleapis.com \
  apikeys.googleapis.com

ACCESS_TOKEN="$(gcloud auth print-access-token)"
: "${ACCESS_TOKEN:?Unable to obtain a Google Cloud access token}"

KEY_NAME="$(gcloud services api-keys list \
  --filter='displayName=KYC Agent Web Login' \
  --format='value(name)' \
  --limit=1)"

if [[ -z "$KEY_NAME" ]]; then
  gcloud services api-keys create \
    --display-name='KYC Agent Web Login' \
    --api-target=service=identitytoolkit.googleapis.com \
    --api-target=service=securetoken.googleapis.com \
    --quiet >/dev/null
  KEY_NAME="$(gcloud services api-keys list \
    --filter='displayName=KYC Agent Web Login' \
    --format='value(name)' \
    --limit=1)"
fi

API_KEY="$(gcloud services api-keys get-key-string "$KEY_NAME" --format='value(keyString)')"

gcloud run deploy "$SERVICE" \
  --source=. \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --service-account="$SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=20 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},KYC_DOCUMENT_BUCKET=${BUCKET},FIREBASE_API_KEY=${API_KEY}" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"

gcloud services api-keys update "$KEY_NAME" \
  --api-target=service=identitytoolkit.googleapis.com \
  --api-target=service=securetoken.googleapis.com \
  --allowed-referrers="${SERVICE_URL}/*,http://localhost:3000/*" \
  --quiet

printf '\nDeployment complete.\nURL: %s\n' "$SERVICE_URL"
printf 'Enable Email/Password in Identity Platform and provision verified allowlisted users with strong unique passwords before login testing.\n'
