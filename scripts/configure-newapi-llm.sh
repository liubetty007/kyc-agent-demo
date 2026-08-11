#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
REGION="${REGION:-asia-east2}"
SERVICE="${SERVICE:-kyc-agent-frontend}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
GCLOUD="${GCLOUD:-gcloud}"

NEWAPI_BASE_URL="${NEWAPI_BASE_URL:-https://newapi.elevatesphere.com/v1}"
NEWAPI_MODEL="${NEWAPI_MODEL:-gpustack-minimax-m2.7}"
PADDLEOCR_BASE_URL="${PADDLEOCR_BASE_URL:-https://kyc-paddleocr-qam2sdmeuq-df.a.run.app}"
PADDLEOCR_AUTH_MODE="${PADDLEOCR_AUTH_MODE:-google_id_token}"

read_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    read -rsp "${name}: " value
    printf '\n' >&2
  fi
  printf '%s' "$value"
}

upsert_secret() {
  local secret_name="$1"
  local secret_value="$2"
  if ! "$GCLOUD" secrets describe "$secret_name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    "$GCLOUD" secrets create "$secret_name" --project="$PROJECT_ID" --replication-policy=automatic >/dev/null
  fi
  printf '%s' "$secret_value" | "$GCLOUD" secrets versions add "$secret_name" --project="$PROJECT_ID" --data-file=- >/dev/null
  "$GCLOUD" secrets add-iam-policy-binding "$secret_name" \
    --project="$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role='roles/secretmanager.secretAccessor' \
    --quiet >/dev/null
}

"$GCLOUD" config set project "$PROJECT_ID" >/dev/null
"$GCLOUD" services enable secretmanager.googleapis.com run.googleapis.com --project="$PROJECT_ID" >/dev/null

if [[ -z "$PADDLEOCR_BASE_URL" ]]; then
  read -rp 'PADDLEOCR_BASE_URL: ' PADDLEOCR_BASE_URL
fi
if [[ -z "$PADDLEOCR_BASE_URL" ]]; then
  echo 'PADDLEOCR_BASE_URL is required.' >&2
  exit 1
fi

newapi_api_key="$(read_secret NEWAPI_API_KEY)"
upsert_secret newapi-api-key "$newapi_api_key"

"$GCLOUD" run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-secrets=NEWAPI_API_KEY=newapi-api-key:latest \
  --update-env-vars=LLM_PROVIDER=newapi,NEWAPI_BASE_URL="$NEWAPI_BASE_URL",NEWAPI_MODEL="$NEWAPI_MODEL",NEWAPI_TIMEOUT_MS=180000,NEWAPI_MAX_TOKENS=4096,NEWAPI_MAX_TEXT_CHARS=18000,PADDLEOCR_BASE_URL="$PADDLEOCR_BASE_URL",PADDLEOCR_AUTH_MODE="$PADDLEOCR_AUTH_MODE",PADDLEOCR_REQUIRED=true,PADDLEOCR_TIMEOUT_MS=180000,PADDLEOCR_MAX_INPUT_BYTES=20971520,PADDLEOCR_MAX_TEXT_CHARS=50000,PADDLEOCR_MIN_SCORE=0.35 \
  --remove-env-vars=OLLAMA_BASE_URL,OLLAMA_MODEL,OLLAMA_AUTH_MODE,ANTHROPIC_MODEL \
  --quiet

printf '\nConfigured PaddleOCR -> NewAPI/MiniMax for %s in %s.\n' "$SERVICE" "$PROJECT_ID"
