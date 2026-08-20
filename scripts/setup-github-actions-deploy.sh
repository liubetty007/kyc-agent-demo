#!/usr/bin/env bash
# One-time, idempotent setup for GitHub Actions -> Cloud Run deployment.
# Uses Workload Identity Federation; it never creates or downloads a key file.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-kyc-agent-staging-20260610}"
EXPECTED_PROJECT_NUMBER="${PROJECT_NUMBER:-20130272975}"
POOL_ID="${WIF_POOL_ID:-github-actions}"
PROVIDER_ID="${WIF_PROVIDER_ID:-kyc-agent-main}"
DEPLOYER_NAME="${DEPLOYER_NAME:-kyc-agent-github-deployer}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-kyc-agent-runner@${PROJECT_ID}.iam.gserviceaccount.com}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-liubetty007/kyc-agent-demo}"
GITHUB_REPOSITORY_ID="${GITHUB_REPOSITORY_ID:-1271046505}"
GITHUB_OWNER_ID="${GITHUB_OWNER_ID:-294129570}"
WORKFLOW_REF="${WORKFLOW_REF:-${GITHUB_REPOSITORY}/.github/workflows/ci.yml@refs/heads/main}"
GCLOUD="${GCLOUD:-gcloud}"

"$GCLOUD" config set project "$PROJECT_ID" >/dev/null
"$GCLOUD" services enable \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  serviceusage.googleapis.com \
  --project="$PROJECT_ID" \
  --quiet

PROJECT_NUMBER="$("$GCLOUD" projects describe "$PROJECT_ID" --format='value(projectNumber)')"
if [[ "$PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]]; then
  echo "ERROR: project number mismatch for ${PROJECT_ID}. Expected ${EXPECTED_PROJECT_NUMBER}, got ${PROJECT_NUMBER}." >&2
  exit 1
fi

DEPLOYER_SERVICE_ACCOUNT="${DEPLOYER_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

if ! "$GCLOUD" iam service-accounts describe "$DEPLOYER_SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" >/dev/null 2>&1; then
  "$GCLOUD" iam service-accounts create "$DEPLOYER_NAME" \
    --project="$PROJECT_ID" \
    --display-name='KYC Agent GitHub deployer' \
    --description='Keyless deployer restricted to the KYC Agent main workflow'
fi

for role in roles/run.sourceDeveloper roles/serviceusage.serviceUsageConsumer; do
  "$GCLOUD" projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

# Allow the deployer to attach only the application's existing runtime identity.
"$GCLOUD" iam service-accounts add-iam-policy-binding "$RUNTIME_SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" \
  --role=roles/iam.serviceAccountUser \
  --condition=None \
  --quiet >/dev/null

# Cloud Run source deployments use Cloud Build's default build identity.
"$GCLOUD" projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SERVICE_ACCOUNT}" \
  --role=roles/run.builder \
  --condition=None \
  --quiet >/dev/null

# The GitHub deployer must be allowed to select the build identity for a
# source deployment. This does not let it mint credentials for unrelated
# service accounts.
"$GCLOUD" iam service-accounts add-iam-policy-binding "$BUILD_SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SERVICE_ACCOUNT}" \
  --role=roles/iam.serviceAccountUser \
  --condition=None \
  --quiet >/dev/null

if ! "$GCLOUD" iam workload-identity-pools describe "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location=global >/dev/null 2>&1; then
  "$GCLOUD" iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --display-name='GitHub Actions' \
    --description='Keyless GitHub Actions identities'
fi

ATTRIBUTE_MAPPING='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref'
ATTRIBUTE_CONDITION="assertion.repository_id=='${GITHUB_REPOSITORY_ID}' && assertion.repository_owner_id=='${GITHUB_OWNER_ID}' && assertion.repository=='${GITHUB_REPOSITORY}' && assertion.ref=='refs/heads/main' && assertion.workflow_ref=='${WORKFLOW_REF}'"

if "$GCLOUD" iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  "$GCLOUD" iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --issuer-uri='https://token.actions.githubusercontent.com' \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION"
else
  "$GCLOUD" iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name='KYC Agent main workflow' \
    --description='Only the fixed KYC Agent main-branch CI workflow' \
    --issuer-uri='https://token.actions.githubusercontent.com' \
    --attribute-mapping="$ATTRIBUTE_MAPPING" \
    --attribute-condition="$ATTRIBUTE_CONDITION"
fi

POOL_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}"
"$GCLOUD" iam service-accounts add-iam-policy-binding "$DEPLOYER_SERVICE_ACCOUNT" \
  --project="$PROJECT_ID" \
  --member="principalSet://iam.googleapis.com/${POOL_NAME}/attribute.repository_id/${GITHUB_REPOSITORY_ID}" \
  --role=roles/iam.workloadIdentityUser \
  --condition=None \
  --quiet >/dev/null

PROVIDER_NAME="$("$GCLOUD" iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location=global \
  --workload-identity-pool="$POOL_ID" \
  --format='value(name)')"

printf '\nGitHub Actions deployment identity is ready.\n'
printf 'Provider: %s\n' "$PROVIDER_NAME"
printf 'Service account: %s\n' "$DEPLOYER_SERVICE_ACCOUNT"
printf 'Allowed repository ID: %s (%s)\n' "$GITHUB_REPOSITORY_ID" "$GITHUB_REPOSITORY"
printf 'Allowed workflow: %s\n' "$WORKFLOW_REF"
printf 'No Google service-account key was created.\n'
