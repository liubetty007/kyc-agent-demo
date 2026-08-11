#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
REGION="${REGION:-asia-east2}"
SERVICE="${PADDLEOCR_SERVICE:-kyc-paddleocr}"
CALLER_SERVICE_ACCOUNT="${CALLER_SERVICE_ACCOUNT:-kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
OCR_SERVICE_ACCOUNT="${OCR_SERVICE_ACCOUNT:-kyc-paddleocr@${PROJECT_ID}.iam.gserviceaccount.com}"
GCLOUD="${GCLOUD:-gcloud}"

"$GCLOUD" config set project "$PROJECT_ID" >/dev/null
"$GCLOUD" services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project="$PROJECT_ID" --quiet

if ! "$GCLOUD" iam service-accounts describe "$OCR_SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1; then
  "$GCLOUD" iam service-accounts create kyc-paddleocr \
    --project="$PROJECT_ID" \
    --display-name="KYC private PaddleOCR runtime" \
    --quiet
fi

"$GCLOUD" run deploy "$SERVICE" \
  --source="$ROOT/services/paddleocr" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --platform=managed \
  --no-allow-unauthenticated \
  --service-account="$OCR_SERVICE_ACCOUNT" \
  --memory=4Gi \
  --cpu=2 \
  --concurrency=1 \
  --min-instances=0 \
  --max-instances=2 \
  --timeout=600 \
  --cpu-boost \
  --set-env-vars=PADDLEOCR_DEVICE=cpu,PADDLEOCR_MAX_INPUT_BYTES=20971520 \
  --quiet

"$GCLOUD" run services add-iam-policy-binding "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --member="serviceAccount:${CALLER_SERVICE_ACCOUNT}" \
  --role=roles/run.invoker \
  --quiet >/dev/null

SERVICE_URL="$("$GCLOUD" run services describe "$SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"

printf '%s\n' "$SERVICE_URL"
