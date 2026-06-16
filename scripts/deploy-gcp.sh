#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
PROJECT_NUMBER="${PROJECT_NUMBER:-20130272975}"
REGION="${REGION:-asia-east2}"
BUCKET="${BUCKET:-kyc-agent-docs-${PROJECT_NUMBER}}"
SERVICE_ACCOUNT="kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com"
GCLOUD="${GCLOUD:-/Users/openclawbot/google-cloud-sdk/bin/gcloud}"

"$GCLOUD" config set project "$PROJECT_ID"
"$GCLOUD" services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  identitytoolkit.googleapis.com \
  artifactregistry.googleapis.com \
  iamcredentials.googleapis.com \
  firebase.googleapis.com

"$GCLOUD" firestore databases describe --database='(default)' --project="$PROJECT_ID" >/dev/null 2>&1 || \
  "$GCLOUD" firestore databases create --database='(default)' --location="$REGION" --type=firestore-native --project="$PROJECT_ID"

"$GCLOUD" storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1 || \
  "$GCLOUD" storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access \
    --public-access-prevention

"$GCLOUD" iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" >/dev/null 2>&1 || \
  "$GCLOUD" iam service-accounts create kyc-agent-runner \
    --display-name='KYC Agent Cloud Run' \
    --project="$PROJECT_ID"

"$GCLOUD" projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role='roles/datastore.user' \
  --condition=None

"$GCLOUD" storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role='roles/storage.objectAdmin'

"$GCLOUD" iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role='roles/iam.serviceAccountTokenCreator' \
  --project="$PROJECT_ID"

echo "Base resources configured. Configure Firebase Authentication before Cloud Run deployment."

