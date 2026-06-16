#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
REGION="${REGION:-asia-east2}"
SERVICE="${SERVICE:-kyc-agent-staging}"
BUCKET="${BUCKET:-kyc-agent-docs-20130272975}"
SERVICE_ACCOUNT="kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com"
PASSWORD_FILE="$HOME/kyc-agent-test-passwords.txt"

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  identitytoolkit.googleapis.com \
  apikeys.googleapis.com

ACCESS_TOKEN="$(gcloud auth print-access-token)"
curl --fail --silent --show-error \
  -X PATCH \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  -H 'Content-Type: application/json' \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email" \
  -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}' >/dev/null

KEY_NAME="$(gcloud services api-keys list \
  --filter='displayName=KYC Agent Web Login' \
  --format='value(name)' \
  --limit=1)"

if [[ -z "$KEY_NAME" ]]; then
  gcloud services api-keys create \
    --display-name='KYC Agent Web Login' \
    --api-target=service=identitytoolkit.googleapis.com \
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
  --allowed-referrers="${SERVICE_URL}/*,http://localhost:3000/*" \
  --quiet

create_test_user() {
  local email="$1"
  local password
  password="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)Aa1!"
  local response
  response="$(curl --silent --show-error \
    -X POST \
    -H 'Content-Type: application/json' \
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}" \
    -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"returnSecureToken\":false}")"
  if jq -e '.localId' >/dev/null 2>&1 <<<"$response"; then
    printf '%s\t%s\n' "$email" "$password" >>"$PASSWORD_FILE"
  elif jq -e '.error.message == "EMAIL_EXISTS"' >/dev/null 2>&1 <<<"$response"; then
    printf '%s\t%s\n' "$email" 'EXISTING ACCOUNT - reset password in Identity Platform' >>"$PASSWORD_FILE"
  else
    printf 'Failed to create %s: %s\n' "$email" "$response" >&2
    return 1
  fi
}

umask 077
: >"$PASSWORD_FILE"
create_test_user 'liuyueanan@icloud.com'
create_test_user 'liubetty007@gmail.com'
create_test_user 'liuy00066@gmail.com'
chmod 600 "$PASSWORD_FILE"

printf '\nDeployment complete.\nURL: %s\nPasswords: %s\n' "$SERVICE_URL" "$PASSWORD_FILE"
