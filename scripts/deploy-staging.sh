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
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"
GMAIL_SENDER_EMAIL="${GMAIL_SENDER_EMAIL:-liubetty007@gmail.com}"
KYC_TEAM_EMAIL="${KYC_TEAM_EMAIL:-liubetty007@gmail.com}"
LLM_PROVIDER="${LLM_PROVIDER:-newapi}"
NEWAPI_BASE_URL="${NEWAPI_BASE_URL:-https://newapi.elevatesphere.com/v1}"
NEWAPI_MODEL="${NEWAPI_MODEL:-gpustack-minimax-m2.7}"
PADDLEOCR_BASE_URL="${PADDLEOCR_BASE_URL:-https://kyc-paddleocr-qam2sdmeuq-df.a.run.app}"
PADDLEOCR_AUTH_MODE="${PADDLEOCR_AUTH_MODE:-google_id_token}"

# Betty demo Drive (see config/betty-drive.defaults.json)
KYC_DRIVE_ROOT_FOLDER_ID="${KYC_DRIVE_ROOT_FOLDER_ID:-1ROwiFHPpJyE7zHQGHQanAY43QHrc6eRF}"
KYC_DRIVE_CASES_FOLDER_ID="${KYC_DRIVE_CASES_FOLDER_ID:-19D4sdsUdMMnRiIiaEFDhnmBywsw3W7H3}"
KYC_DRIVE_TEMPLATES_FOLDER_ID="${KYC_DRIVE_TEMPLATES_FOLDER_ID:-10ZLHl60DJijG1S5Rvc0aqTdv08TiJxyx}"
KYC_STANDARD_DRIVE_FOLDER_ID="${KYC_STANDARD_DRIVE_FOLDER_ID:-${KYC_DRIVE_TEMPLATES_FOLDER_ID}}"

echo "==> Betty demo deploy"
echo "    Project: $PROJECT_ID | Service: $SERVICE | Region: $REGION"
echo "    Gmail sender: $GMAIL_SENDER_EMAIL"
echo "    Drive root: $KYC_DRIVE_ROOT_FOLDER_ID"
echo "    Analysis: PaddleOCR -> $LLM_PROVIDER / $NEWAPI_MODEL"

if [[ -z "$FIREBASE_API_KEY" ]]; then
  echo "ERROR: FIREBASE_API_KEY is required for Identity Platform password login." >&2
  exit 1
fi

if [[ -z "$PADDLEOCR_BASE_URL" ]]; then
  echo "ERROR: PADDLEOCR_BASE_URL is required for document analysis." >&2
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

SECRET_BINDINGS=""
if gcloud secrets describe gmail-client-id --project="$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_BINDINGS="GMAIL_CLIENT_ID=gmail-client-id:latest,GMAIL_CLIENT_SECRET=gmail-client-secret:latest,GMAIL_REFRESH_TOKEN=gmail-refresh-token:latest"
else
  echo "WARN: Gmail secrets not found in $PROJECT_ID. Run scripts/configure-real-email-secrets.sh with Betty's OAuth first."
fi

if gcloud secrets describe newapi-api-key --project="$PROJECT_ID" >/dev/null 2>&1; then
  SECRET_BINDINGS="${SECRET_BINDINGS:+${SECRET_BINDINGS},}NEWAPI_API_KEY=newapi-api-key:latest"
else
  echo "ERROR: Secret Manager secret newapi-api-key is required for MiniMax." >&2
  exit 1
fi

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
  --service-account="$SERVICE_ACCOUNT" \
  --update-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},KYC_DOCUMENT_BUCKET=${BUCKET},FIREBASE_API_KEY=${FIREBASE_API_KEY},GMAIL_SENDER_EMAIL=${GMAIL_SENDER_EMAIL},KYC_TEAM_EMAIL=${KYC_TEAM_EMAIL},KYC_DRIVE_ROOT_FOLDER_ID=${KYC_DRIVE_ROOT_FOLDER_ID},KYC_DRIVE_CASES_FOLDER_ID=${KYC_DRIVE_CASES_FOLDER_ID},KYC_DRIVE_TEMPLATES_FOLDER_ID=${KYC_DRIVE_TEMPLATES_FOLDER_ID},KYC_STANDARD_DRIVE_FOLDER_ID=${KYC_STANDARD_DRIVE_FOLDER_ID},LLM_PROVIDER=${LLM_PROVIDER},NEWAPI_BASE_URL=${NEWAPI_BASE_URL},NEWAPI_MODEL=${NEWAPI_MODEL},NEWAPI_TIMEOUT_MS=180000,NEWAPI_MAX_TOKENS=4096,NEWAPI_MAX_TEXT_CHARS=18000,PADDLEOCR_BASE_URL=${PADDLEOCR_BASE_URL},PADDLEOCR_AUTH_MODE=${PADDLEOCR_AUTH_MODE},PADDLEOCR_REQUIRED=true,PADDLEOCR_TIMEOUT_MS=180000,PADDLEOCR_MAX_INPUT_BYTES=20971520,PADDLEOCR_MAX_TEXT_CHARS=50000,PADDLEOCR_MIN_SCORE=0.35,NODE_ENV=production" \
  --remove-env-vars="FIREBASE_AUTH_DOMAIN,KYC_AUTH_PASSWORDS,KYC_DEV_BYPASS_AUTH,KYC_USE_LOCAL_STORAGE,ANTHROPIC_MODEL,OLLAMA_BASE_URL,OLLAMA_MODEL,OLLAMA_AUTH_MODE" \
  ${SECRET_BINDINGS:+--update-secrets="$SECRET_BINDINGS"} \
  --remove-secrets="KYC_SESSION_SECRET,KYC_AUTH_PASSWORDS_JSON,ANTHROPIC_API_KEY" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"

printf '\n✓ Betty demo deployment complete\n'
printf 'URL: %s\n' "$SERVICE_URL"
printf 'Login: %s/login\n' "$SERVICE_URL"
printf 'Drive: Betty KYC文件 (%s)\n' "$KYC_DRIVE_ROOT_FOLDER_ID"
