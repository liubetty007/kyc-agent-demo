#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
REGION="${REGION:-asia-east2}"
SERVICE="${SERVICE:-kyc-agent-staging}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
GCLOUD="${GCLOUD:-gcloud}"

read_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    read -rsp "${name}: " value
    printf '\n' >&2
  fi
  printf '%s' "$value"
}

read_plain() {
  local name="$1"
  local default_value="${2:-}"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    read -rp "${name}${default_value:+ [$default_value]}: " value
    value="${value:-$default_value}"
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
"$GCLOUD" services enable secretmanager.googleapis.com gmail.googleapis.com run.googleapis.com --project="$PROJECT_ID" >/dev/null

gmail_client_id="$(read_secret GMAIL_CLIENT_ID)"
gmail_client_secret="$(read_secret GMAIL_CLIENT_SECRET)"
gmail_refresh_token="$(read_secret GMAIL_REFRESH_TOKEN)"
anthropic_api_key="$(read_secret ANTHROPIC_API_KEY)"
gmail_sender_email="$(read_plain GMAIL_SENDER_EMAIL)"
kyc_team_email="$(read_plain KYC_TEAM_EMAIL "$gmail_sender_email")"
anthropic_model="$(read_plain ANTHROPIC_MODEL "claude-sonnet-4-5")"

upsert_secret gmail-client-id "$gmail_client_id"
upsert_secret gmail-client-secret "$gmail_client_secret"
upsert_secret gmail-refresh-token "$gmail_refresh_token"
upsert_secret anthropic-api-key "$anthropic_api_key"

"$GCLOUD" run services update "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --update-secrets=GMAIL_CLIENT_ID=gmail-client-id:latest,GMAIL_CLIENT_SECRET=gmail-client-secret:latest,GMAIL_REFRESH_TOKEN=gmail-refresh-token:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest \
  --update-env-vars=GMAIL_SENDER_EMAIL="$gmail_sender_email",KYC_TEAM_EMAIL="$kyc_team_email",ANTHROPIC_MODEL="$anthropic_model" \
  --quiet

printf '\nConfigured real Gmail + LLM secrets for %s in %s.\n' "$SERVICE" "$PROJECT_ID"
