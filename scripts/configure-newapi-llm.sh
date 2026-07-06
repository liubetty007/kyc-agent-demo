#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
REGION="${REGION:-asia-east2}"
SERVICE="${SERVICE:-kyc-agent-frontend}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
GCLOUD="${GCLOUD:-gcloud}"

NEWAPI_BASE_URL="${NEWAPI_BASE_URL:-https://newapi.elevatesphere.com/v1}"
NEWAPI_MODEL="${NEWAPI_MODEL:-qwen3-vl-235b-a22b-instruct-fp8}"

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

newapi_api_key="$(read_secret NEWAPI_API_KEY)"
upsert_secret newapi-api-key "$newapi_api_key"

"$GCLOUD" run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-secrets=NEWAPI_API_KEY=newapi-api-key:latest \
  --update-env-vars=LLM_PROVIDER=newapi,NEWAPI_BASE_URL="$NEWAPI_BASE_URL",NEWAPI_MODEL="$NEWAPI_MODEL" \
  --quiet

printf '\nConfigured NewAPI/Qwen3-VL for %s in %s.\n' "$SERVICE" "$PROJECT_ID"
