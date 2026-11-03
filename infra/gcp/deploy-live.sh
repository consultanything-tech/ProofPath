#!/usr/bin/env bash
set -euo pipefail
GCLOUD=${GCLOUD:-/Users/vermapankaj/Downloads/Dev-Projects/google-cloud-sdk/bin/gcloud}
ACCOUNT=${PROOFPATH_GCP_ACCOUNT:?Set PROOFPATH_GCP_ACCOUNT to your deployer account}
PROJECT=proofpath-hackathon-2026
REGION=asia-southeast1
IMAGE=$(cat outputs/gcp/image.txt)
[[ "$IMAGE" =~ ^asia-southeast1-docker.pkg.dev/proofpath-hackathon-2026/proofpath/app@sha256:[a-f0-9]{64}$ ]]
CONFIG=runs/gcp-migration/live-release-20261103/migration-config.json
[[ -f "$CONFIG" && -f runs/v2-live/operator/gcp-live.retired.json ]]
gc() { "$GCLOUD" --account="$ACCOUNT" --project="$PROJECT" "$@"; }
WEB=$(gc run services describe proofpath-web --region="$REGION" --format='value(status.url)')
WORKER=$(gc run services describe proofpath-worker --region="$REGION" --format='value(status.url)')
ENV_FILE=$(mktemp /tmp/proofpath-live-env.XXXXXX)
trap 'rm -f "$ENV_FILE"' EXIT
pin() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pins"][sys.argv[2]])' "$CONFIG" "$1"; }
write_env() {
  python3 - "$ENV_FILE" "$CONFIG" "$WEB" "$WORKER" "$1" <<'PY'
import json,sys
path,config,web,worker,role=sys.argv[1:]; c=json.load(open(config))
assert c['project']=='proofpath-hackathon-2026' and c['namespace']=='live-release-20261103'
value=dict(PROOFPATH_RUNTIME="gcp",PROOFPATH_ROLE=role,GCP_DATA_PROFILE="live",GCP_PROJECT_ID=c['project'],GCP_REGION=c['region'],GCP_STATE_NAMESPACE=c['namespace'],GCP_FIRESTORE_DATABASE="(default)",GCP_EVIDENCE_BUCKET=c['project']+"-evidence",GCP_TASKS_QUEUE="proofpath-live-runs",GCP_WORKER_URL=worker,GCP_TASK_CALLER_SERVICE_ACCOUNT="proofpath-tasks@"+c['project']+".iam.gserviceaccount.com",PUBLIC_ORIGIN=web,V2_PLANNER_MODE="meta",PLANNER_MODE="fixture",FIXTURE_PORT="4173")
if role=='web': value['GCP_IMPORT_OBJECT']=json.dumps(c['importObject'])
with open(path,'w') as f: json.dump(value,f)
PY
}
for NAME in model-api-key ledger-key reviewer-pepper reviewer-digests; do
  gc secrets add-iam-policy-binding "proofpath-$NAME" --member="serviceAccount:proofpath-web@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null
done
gc secrets add-iam-policy-binding proofpath-ledger-key --member="serviceAccount:proofpath-operator@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null
if ! gc tasks queues describe proofpath-live-runs --location="$REGION" >/dev/null 2>&1; then gc tasks queues create proofpath-live-runs --location="$REGION" --max-concurrent-dispatches=1 --max-dispatches-per-second=1 --max-attempts=3 --max-retry-duration=600s --min-backoff=5s --max-backoff=30s; fi
write_env web
# Never set IMPORT=yes again after a successful import; initialization refuses nonempty state.
if [[ "${IMPORT:-no}" == yes ]]; then
  gc run jobs deploy proofpath-live-import --region="$REGION" --image="$IMAGE" --service-account="proofpath-operator@$PROJECT.iam.gserviceaccount.com" --memory=1Gi --cpu=1 --max-retries=0 --task-timeout=1200s --command=node --args=dist/src/gcp/operator.js,init-live --env-vars-file="$ENV_FILE" --set-secrets="GCP_LEDGER_KEY=$(pin ledger-key)" --execute-now --wait --quiet
fi
for ROLE in worker web; do
  write_env "$ROLE"
  if [[ "$ROLE" == web ]]; then
    SECRETS=(--set-secrets="MODEL_API_KEY=$(pin model-api-key),GCP_LEDGER_KEY=$(pin ledger-key),GCP_REVIEWER_PEPPER=$(pin reviewer-pepper),GCP_REVIEWER_DIGESTS=$(pin reviewer-digests)")
  else SECRETS=(--clear-secrets); fi
  gc run deploy "proofpath-$ROLE" --region="$REGION" --image="$IMAGE" --service-account="proofpath-$ROLE@$PROJECT.iam.gserviceaccount.com" --port=8080 --memory=2Gi --cpu=1 --concurrency=1 --min-instances=0 --max-instances=1 --timeout=300s --cpu-throttling --no-allow-unauthenticated --env-vars-file="$ENV_FILE" "${SECRETS[@]}" --quiet
done
write_env web
gc run jobs deploy proofpath-live-check --region="$REGION" --image="$IMAGE" --service-account="proofpath-operator@$PROJECT.iam.gserviceaccount.com" --memory=512Mi --cpu=1 --max-retries=0 --task-timeout=300s --command=node --args=dist/src/gcp/operator.js,check-live --env-vars-file="$ENV_FILE" --execute-now --wait --quiet
gc run services get-iam-policy proofpath-worker --region="$REGION" --format=json > /tmp/proofpath-live-worker-iam.json
gc run services describe proofpath-worker --region="$REGION" --format=json > /tmp/proofpath-live-worker-config.json
gc storage buckets describe "gs://$PROJECT-evidence" --format=json > /tmp/proofpath-live-bucket.json
python3 - <<'PY'
import json
p=json.load(open('/tmp/proofpath-live-worker-iam.json'))
assert {m for b in p.get('bindings',[]) if b['role']=='roles/run.invoker' for m in b.get('members',[])} == {'serviceAccount:proofpath-tasks@proofpath-hackathon-2026.iam.gserviceaccount.com'}
w=json.load(open('/tmp/proofpath-live-worker-config.json'))
env=w['spec']['template']['spec']['containers'][0].get('env',[])
assert all('valueFrom' not in e for e in env), 'Worker must not mount secrets'
b=json.load(open('/tmp/proofpath-live-bucket.json'))
assert b.get('public_access_prevention')=='enforced', 'Evidence bucket must prevent public access'
PY
# Reviewer authentication remains enforced by the app; only the web entry becomes public.
gc run services add-iam-policy-binding proofpath-web --region="$REGION" --member=allUsers --role=roles/run.invoker >/dev/null
gc secrets remove-iam-policy-binding proofpath-ledger-key --member="serviceAccount:proofpath-operator@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null
python3 - "$WEB" "$WORKER" "$IMAGE" "$CONFIG" <<'PY'
import json,sys,datetime
web,worker,image,config=sys.argv[1:]; c=json.load(open(config))
marker='runs/v2-live/operator/gcp-live.retired.json'; m=json.load(open(marker)); m.update(phase='deployed',web=web,image=image,deployedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()); open(marker,'w').write(json.dumps(m))
report=dict(web=web,worker=worker,image=image,namespace=c['namespace'],reservationsAtImport=c['reservations'],v1Reports=c['v1Reports'],v2Reports=c['v2Reports'],providerCanary=False)
open('outputs/gcp/live-deployment.json','w').write(json.dumps(report,indent=2))
PY
printf 'Reviewer-code protected ProofPath deployment: %s\n' "$WEB"
