#!/usr/bin/env bash
set -euo pipefail
GCLOUD=${GCLOUD:-/Users/vermapankaj/Downloads/Dev-Projects/google-cloud-sdk/bin/gcloud}
ACCOUNT=${PROOFPATH_GCP_ACCOUNT:?Set PROOFPATH_GCP_ACCOUNT to your deployer account}
PROJECT=proofpath-hackathon-2026
REGION=asia-southeast1
BILLING=${PROOFPATH_GCP_BILLING_ACCOUNT:?Set PROOFPATH_GCP_BILLING_ACCOUNT}
gc() { "$GCLOUD" --account="$ACCOUNT" --project="$PROJECT" "$@"; }

if ! gc projects describe "$PROJECT" --format='value(projectId)' >/dev/null 2>&1; then
  gc projects create "$PROJECT" --name=ProofPath
fi
gc billing projects link "$PROJECT" --billing-account="$BILLING"
gc services enable run.googleapis.com firestore.googleapis.com cloudtasks.googleapis.com storage.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com logging.googleapis.com billingbudgets.googleapis.com
NUMBER=$(gc projects describe "$PROJECT" --format='value(projectNumber)')
for NAME in web worker tasks operator build; do
  SA="proofpath-$NAME@$PROJECT.iam.gserviceaccount.com"
  if ! gc iam service-accounts describe "$SA" >/dev/null 2>&1; then gc iam service-accounts create "proofpath-$NAME" --display-name="ProofPath $NAME"; fi
done
if ! gc firestore databases describe --database='(default)' >/dev/null 2>&1; then gc firestore databases create --database='(default)' --location="$REGION" --type=firestore-native --delete-protection; fi
for KIND in evidence build-source; do
  BUCKET="$PROJECT-$KIND"
  if ! gc storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then gc storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention; fi
done
if ! gc artifacts repositories describe proofpath --location="$REGION" >/dev/null 2>&1; then gc artifacts repositories create proofpath --location="$REGION" --repository-format=docker; fi
for NAME in web worker operator; do
  MEMBER="serviceAccount:proofpath-$NAME@$PROJECT.iam.gserviceaccount.com"
  gc projects add-iam-policy-binding "$PROJECT" --member="$MEMBER" --role=roles/datastore.user --condition=None --quiet >/dev/null
  for ROLE in roles/storage.objectCreator roles/storage.objectViewer; do gc storage buckets add-iam-policy-binding "gs://$PROJECT-evidence" --member="$MEMBER" --role="$ROLE" >/dev/null; done
done
gc projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:proofpath-web@$PROJECT.iam.gserviceaccount.com" --role=roles/cloudtasks.enqueuer --condition=None --quiet >/dev/null
gc iam service-accounts add-iam-policy-binding "proofpath-tasks@$PROJECT.iam.gserviceaccount.com" --member="serviceAccount:proofpath-web@$PROJECT.iam.gserviceaccount.com" --role=roles/iam.serviceAccountUser --quiet >/dev/null
gc artifacts repositories add-iam-policy-binding proofpath --location="$REGION" --member="serviceAccount:proofpath-build@$PROJECT.iam.gserviceaccount.com" --role=roles/artifactregistry.writer >/dev/null
gc storage buckets add-iam-policy-binding "gs://$PROJECT-build-source" --member="serviceAccount:proofpath-build@$PROJECT.iam.gserviceaccount.com" --role=roles/storage.objectViewer >/dev/null
gc projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:proofpath-build@$PROJECT.iam.gserviceaccount.com" --role=roles/logging.logWriter --condition=None --quiet >/dev/null
if ! gc tasks queues describe proofpath-fixture-runs --location="$REGION" >/dev/null 2>&1; then gc tasks queues create proofpath-fixture-runs --location="$REGION" --max-concurrent-dispatches=1 --max-dispatches-per-second=1 --max-attempts=3 --max-retry-duration=600s --min-backoff=5s --max-backoff=30s; fi
gc projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:service-$NUMBER@gcp-sa-cloudtasks.iam.gserviceaccount.com" --role=roles/cloudtasks.serviceAgent --condition=None --quiet >/dev/null
printf 'Provisioned dedicated project %s (%s) in %s. No public service or live model admission enabled.\n' "$PROJECT" "$NUMBER" "$REGION"
