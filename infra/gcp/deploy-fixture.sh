#!/usr/bin/env bash
set -euo pipefail
GCLOUD=${GCLOUD:-/Users/vermapankaj/Downloads/Dev-Projects/google-cloud-sdk/bin/gcloud}
ACCOUNT=${PROOFPATH_GCP_ACCOUNT:?Set PROOFPATH_GCP_ACCOUNT to your deployer account}
PROJECT=proofpath-hackathon-2026
REGION=asia-southeast1
IMAGE=$(cat outputs/gcp/image.txt)
[[ "$IMAGE" =~ ^asia-southeast1-docker.pkg.dev/proofpath-hackathon-2026/proofpath/app@sha256:[a-f0-9]{64}$ ]]
NAMESPACE=${NAMESPACE:-fixture-release-20261103}
[[ "$NAMESPACE" =~ ^fixture-[a-z0-9-]+$ ]]
gc() { "$GCLOUD" --account="$ACCOUNT" --project="$PROJECT" "$@"; }
ENV_FILE=$(mktemp /tmp/proofpath-fixture-env.XXXXXX)
trap 'rm -f "$ENV_FILE"' EXIT
WEB=https://bootstrap.invalid
WORKER=https://bootstrap.invalid
write_env() {
  python3 - "$ENV_FILE" "$PROJECT" "$REGION" "$NAMESPACE" "$WEB" "$WORKER" "$1" <<'PY'
import json,sys
path,project,region,namespace,web,worker,role=sys.argv[1:]
value=dict(PROOFPATH_RUNTIME="gcp",PROOFPATH_ROLE=role,GCP_DATA_PROFILE="fixture",GCP_PROJECT_ID=project,GCP_REGION=region,GCP_STATE_NAMESPACE=namespace,GCP_FIRESTORE_DATABASE="(default)",GCP_EVIDENCE_BUCKET=project+"-evidence",GCP_TASKS_QUEUE="proofpath-fixture-runs",GCP_WORKER_URL=worker,GCP_TASK_CALLER_SERVICE_ACCOUNT="proofpath-tasks@"+project+".iam.gserviceaccount.com",PUBLIC_ORIGIN=web,V2_PLANNER_MODE="fixture",PLANNER_MODE="fixture",FIXTURE_PORT="4173")
with open(path,'w') as f: json.dump(value,f)
PY
}
write_env web
# Initialization is explicit and refuses an existing namespace. Never reset one on retry.
if [[ "${INITIALIZE:-no}" == yes ]]; then
  gc run jobs deploy proofpath-fixture-operator --region="$REGION" --image="$IMAGE" --service-account="proofpath-operator@$PROJECT.iam.gserviceaccount.com" --memory=1Gi --cpu=1 --max-retries=0 --task-timeout=1200s --command=node --args=dist/src/gcp/operator.js,init-fixture --env-vars-file="$ENV_FILE" --execute-now --wait --quiet
fi
for ROLE in worker web; do
  write_env "$ROLE"
  gc run deploy "proofpath-$ROLE" --region="$REGION" --image="$IMAGE" --service-account="proofpath-$ROLE@$PROJECT.iam.gserviceaccount.com" --port=8080 --memory=2Gi --cpu=1 --concurrency=1 --min-instances=0 --max-instances=1 --timeout=300s --cpu-throttling --no-allow-unauthenticated --env-vars-file="$ENV_FILE" --quiet
  URL=$(gc run services describe "proofpath-$ROLE" --region="$REGION" --format='value(status.url)')
  if [[ "$ROLE" == worker ]]; then WORKER="$URL"; else WEB="$URL"; fi
done
for ROLE in worker web; do
  write_env "$ROLE"
  gc run services update "proofpath-$ROLE" --region="$REGION" --env-vars-file="$ENV_FILE" --quiet
done
gc run services add-iam-policy-binding proofpath-worker --region="$REGION" --member="serviceAccount:proofpath-tasks@$PROJECT.iam.gserviceaccount.com" --role=roles/run.invoker >/dev/null
gc run services add-iam-policy-binding proofpath-web --region="$REGION" --member="serviceAccount:proofpath-operator@$PROJECT.iam.gserviceaccount.com" --role=roles/run.invoker >/dev/null
# Both remain IAM-private. Check the worker identity boundary before dispatching anything.
for ROLE in worker web; do
  gc run services get-iam-policy "proofpath-$ROLE" --region="$REGION" --format=json > "/tmp/proofpath-$ROLE-iam.json"
done
python3 - <<'PY'
import json
for role in ('worker','web'):
    policy=json.load(open('/tmp/proofpath-'+role+'-iam.json'))
    members={m for b in policy.get('bindings',[]) for m in b.get('members',[])}
    assert not {'allUsers','allAuthenticatedUsers'} & members, 'Fixture service must be private'
    allowed='serviceAccount:proofpath-'+('tasks' if role=='worker' else 'operator')+'@proofpath-hackathon-2026.iam.gserviceaccount.com'
    assert {m for b in policy.get('bindings',[]) if b['role']=='roles/run.invoker' for m in b.get('members',[])} == {allowed}
PY
write_env web
gc run jobs deploy proofpath-fixture-operator --region="$REGION" --image="$IMAGE" --service-account="proofpath-operator@$PROJECT.iam.gserviceaccount.com" --memory=1Gi --cpu=1 --max-retries=0 --task-timeout=1200s --command=node --args=dist/src/gcp/operator.js,smoke-fixture --env-vars-file="$ENV_FILE" --execute-now --wait --quiet
mkdir -p outputs/gcp
python3 - "$WEB" "$WORKER" "$NAMESPACE" "$IMAGE" <<'PY' > outputs/gcp/fixture-deployment.json
import json,sys
print(json.dumps(dict(web=sys.argv[1],worker=sys.argv[2],namespace=sys.argv[3],image=sys.argv[4],public=False,liveAdmission=False),indent=2))
PY
printf 'Private cloud fixture acceptance completed: %s\n' "$WEB"
