#!/usr/bin/env bash
# Deploy the official Betty demo to Cloud Run (kyc-agent-staging-20260610).
# Uses Betty's Gmail/Drive OAuth secrets and her existing KYC文件 layout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
PROJECT_NUMBER="${PROJECT_NUMBER:-20130272975}"
REGION="${REGION:-asia-east2}"
SERVICE="${SERVICE:-kyc-agent-frontend}"
BUCKET="${BUCKET:-kyc-agent-docs-${PROJECT_NUMBER}}"
DEFAULT_PASSWORD="${KYC_DEFAULT_PASSWORD:-1234}"
AUTH_USERS="${KYC_AUTH_USERS:-liubetty007@gmail.com,alenw0620@gmail.com,kexin.li@antalpha.com,aaron.pang@antalpha.com}"
SESSION_SECRET="${KYC_SESSION_SECRET:-$(openssl rand -base64 32)}"
GMAIL_SENDER_EMAIL="${GMAIL_SENDER_EMAIL:-liubetty007@gmail.com}"
KYC_TEAM_EMAIL="${KYC_TEAM_EMAIL:-liubetty007@gmail.com}"

# Betty demo Drive (see config/betty-drive.defaults.json)
KYC_DRIVE_ROOT_FOLDER_ID="${KYC_DRIVE_ROOT_FOLDER_ID:-1ROwiFHPpJyE7zHQGHQanAY43QHrc6eRF}"
KYC_DRIVE_CASES_FOLDER_ID="${KYC_DRIVE_CASES_FOLDER_ID:-19D4sdsUdMMnRiIiaEFDhnmBywsw3W7H3}"
KYC_DRIVE_TEMPLATES_FOLDER_ID="${KYC_DRIVE_TEMPLATES_FOLDER_ID:-10ZLHl60DJijG1S5Rvc0aqTdv08TiJxyx}"
KYC_STANDARD_DRIVE_FOLDER_ID="${KYC_STANDARD_DRIVE_FOLDER_ID:-${KYC_DRIVE_TEMPLATES_FOLDER_ID}}"

IFS=',' read -r -a USER_ARRAY <<< "$AUTH_USERS"
AUTH_PASSWORDS=""
for EMAIL in "${USER_ARRAY[@]}"; do
  EMAIL="$(echo "$EMAIL" | tr '[:upper:]' '[:lower:]' | xargs)"
  [[ -z "$EMAIL" ]] && continue
  if [[ -n "$AUTH_PASSWORDS" ]]; then AUTH_PASSWORDS+=","; fi
  AUTH_PASSWORDS+="${EMAIL}:${DEFAULT_PASSWORD}"
done

echo "==> Betty demo deploy"
echo "    Project: $PROJECT_ID | Service: $SERVICE | Region: $REGION"
echo "    Gmail sender: $GMAIL_SENDER_EMAIL"
echo "    Drive root: $KYC_DRIVE_ROOT_FOLDER_ID"

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  --quiet

ENV_FILE="$(mktemp)"
cat >"$ENV_FILE" <<EOF
GOOGLE_CLOUD_PROJECT: ${PROJECT_ID}
KYC_DOCUMENT_BUCKET: ${BUCKET}
KYC_SESSION_SECRET: ${SESSION_SECRET}
KYC_AUTH_PASSWORDS: ${AUTH_PASSWORDS}
GMAIL_SENDER_EMAIL: ${GMAIL_SENDER_EMAIL}
KYC_TEAM_EMAIL: ${KYC_TEAM_EMAIL}
KYC_DRIVE_ROOT_FOLDER_ID: ${KYC_DRIVE_ROOT_FOLDER_ID}
KYC_DRIVE_CASES_FOLDER_ID: ${KYC_DRIVE_CASES_FOLDER_ID}
KYC_DRIVE_TEMPLATES_FOLDER_ID: ${KYC_DRIVE_TEMPLATES_FOLDER_ID}
KYC_STANDARD_DRIVE_FOLDER_ID: ${KYC_STANDARD_DRIVE_FOLDER_ID}
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

if gcloud secrets describe gmail-client-id --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud run services update "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --update-secrets=GMAIL_CLIENT_ID=gmail-client-id:latest,GMAIL_CLIENT_SECRET=gmail-client-secret:latest,GMAIL_REFRESH_TOKEN=gmail-refresh-token:latest \
    --quiet
else
  echo "WARN: Gmail secrets not found in $PROJECT_ID. Run scripts/configure-real-email-secrets.sh with Betty's OAuth first."
fi

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

printf '\n✓ Betty demo deployment complete\n'
printf 'URL: %s\n' "$SERVICE_URL"
printf 'Login: %s/login\n' "$SERVICE_URL"
printf 'Drive: Betty KYC文件 (%s)\n' "$KYC_DRIVE_ROOT_FOLDER_ID"
