#!/usr/bin/env bash
set -euo pipefail
GCLOUD=${GCLOUD:-/Users/vermapankaj/Downloads/Dev-Projects/google-cloud-sdk/bin/gcloud}
ACCOUNT=${PROOFPATH_GCP_ACCOUNT:?Set PROOFPATH_GCP_ACCOUNT to your deployer account}
PROJECT=proofpath-hackathon-2026
REGION=asia-southeast1
gc() { "$GCLOUD" --account="$ACCOUNT" --project="$PROJECT" "$@"; }
STAGE="${TMPDIR:-/tmp}/proofpath-build-$(date -u +%Y%m%dT%H%M%SZ)-$$"
# stage-source permits only /tmp, independent of the caller's shell environment.
STAGE="/tmp/$(basename "$STAGE")"
node infra/gcp/stage-source.mjs "$STAGE"
trap 'rm -rf "$STAGE"' EXIT
TAG="$REGION-docker.pkg.dev/$PROJECT/proofpath/app:$(date -u +%Y%m%dT%H%M%SZ)"
gc builds submit "$STAGE" --config=infra/gcp/cloudbuild.yaml --substitutions="_IMAGE=$TAG" --service-account="projects/$PROJECT/serviceAccounts/proofpath-build@$PROJECT.iam.gserviceaccount.com" --gcs-source-staging-dir="gs://$PROJECT-build-source/source" --timeout=1200s
DIGEST=$(gc artifacts docker images describe "$TAG" --format='value(image_summary.digest)')
[[ "$DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]]
mkdir -p outputs/gcp
printf '%s@%s\n' "${TAG%:*}" "$DIGEST" > outputs/gcp/image.txt
printf 'Pinned image: %s@%s\n' "${TAG%:*}" "$DIGEST"
