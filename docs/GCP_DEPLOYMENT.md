# ProofPath on GCP

## Current release status

The serverless migration supports **both V1 and V2**. It is deployed in `proofpath-hackathon-2026`, Singapore (`asia-southeast1`),
under the owner-selected deployer account. The account's existing global gcloud configuration
was not changed.

The user explicitly approved the live cutover on November 3. The web entry is
now public at https://proofpath-web-vgrq2gffta-as.a.run.app and requires the
existing reviewer code for protected operations and reports. The worker and
evidence bucket remain private. Version-pinned secrets and signed live state
have been imported; local admission is retired. No new provider call was made.
Saved-report, desktop/mobile browser, protected-download and unchanged-accounting
verification passed and is recorded in `outputs/gcp/live-verification.json`.
The cutover preserved seven reports and verified 20 screenshot hashes.

The release image is recorded in `outputs/gcp/image.txt`; build and deployment
receipts belong under `outputs/gcp/`. Local release validation passed **171/171**
unit, browser, safety and integration checks on November 3; the final budget-label
correction passed eight targeted browser checks. The portable sanitized receipt is
[evaluations/gcp-release-2026-11-03.json](evaluations/gcp-release-2026-11-03.json). Cloud fixture
acceptance exercises actual Firestore, private GCS and Cloud Tasks with V1
seeded FAIL/fixed PASS and V2 regression/fixed comparisons, duplicate acceptance,
evidence reads and report downloads. All model behavior in that acceptance is
explicitly fixture behavior.

## Resources and trust boundaries

- `proofpath-web`: same-origin V1/V2 UI and API, loopback synthetic fixtures,
  grounding inspection, reviewer authentication and controlled Meta proposals.
- `proofpath-worker`: IAM-private approved browser execution; only
  `proofpath-tasks` has service-level invocation permission. No provider secrets.
- Firestore `(default)`: bounded records under
  `proofpath/{namespace}/records`. Initialization is an explicit operator action.
- `gs://proofpath-hackathon-2026-evidence`: private immutable evidence, exact
  generation/size/SHA-256 reads. Uniform IAM and public-access prevention enabled.
- Separate fixture and live Cloud Tasks queues. Named tasks deduplicate run
  acceptance; execution uses durable leases and fencing. Expired work becomes
  interrupted/inconclusive, with a new approval required for a new execution.
- A durable planning activity record spans grounding/provider work without
  holding a Firestore transaction across network calls. Uncertain expired
  planning work requires operator reconciliation and receives no refund.
- One immutable image for both roles; request-based billing, min instances 0,
  max instances 1 per service, concurrency 1, 1 CPU/2 GiB, 300-second requests.

The workbench displays proposal limits from the server policy rather than a static allowance.

The web must hold provider/ledger secrets after cutover; the worker must not.
Cloud Run IAM authenticates worker requests. The task-name header is only a
sanity check and is not an authentication mechanism.

## Cost controls

The approved hosting target is **US$10**, not a hard cap. This billing account
uses SGD. A stricter **SGD10 monthly project budget alert** was created at 50%,
90% and 100%; it does not stop resources or spending. Builds, image storage,
logs, network traffic and database operations also incur charges. Minimum-zero
instances reduce idle compute, but do not make the whole deployment free.

Live model admission preserves the existing signed policy and all reservations;
it must never initialize a fresh allowance for deployment. Cutover
inspection confirmed four reservations (US$0.20 reserved), a US$2.50 global bound,
and no admission block. The post-cutover check compares the signed cloud ledger with the preserved source. Baseten is not enabled by this
deployment; its full admission qualification is separate.

## Commands and release sequence

Run from the repository root. Set `PROOFPATH_GCP_ACCOUNT` to your deployer email
and `PROOFPATH_GCP_BILLING_ACCOUNT` to your billing account ID before provisioning.
Keep those values in private operator configuration, not source control.
The scripts use explicit account/project flags
and the SDK at
`/Users/vermapankaj/Downloads/Dev-Projects/google-cloud-sdk/bin/gcloud`.

1. `bash infra/gcp/provision.sh` provisions the dedicated private infrastructure.
2. `pnpm build` and the release tests validate the source.
3. `bash infra/gcp/build.sh` uploads only allowlisted source and builds on Linux.
   It excludes `.env`, `runs/`, private operator material, Git history and local
   dependencies, and records an immutable registry digest.
4. Fixture acceptance before live cutover only (do not redeploy fixture services over the live entry): first namespace only: `INITIALIZE=yes bash infra/gcp/deploy-fixture.sh`.
   Subsequent image validation: `bash infra/gcp/deploy-fixture.sh`. Never reset
   an existing namespace. Both services remain IAM-private. Initial IAM grants
   may take time to propagate; an HTTP 403 before reaching the app is not a
   completed acceptance run.
5. Completed one-time live preparation after explicit authorization:
   `node --env-file-if-exists=.env infra/gcp/prepare-live.mjs`. It verifies local
   ownership/terminal reservations, archives a stale lock only after checking
   no local application Node process uses this checkout (recognised Codex tool helpers are excluded), verifies the existing V3
   source through the operator loader, validates report integrity, and records
   a one-way local retirement marker before transferring state. Pending local
   proposals/approvals are expired. No provider call is made.
6. Completed one-time live import: `IMPORT=yes bash infra/gcp/deploy-live.sh`. A signed
   destination-bound import must verify all object references before explicit
   initialization. The web receives version-pinned secrets. The worker receives
   none. A private check verifies reviewer/worker denial before the web entry is
   made public. The evidence bucket and worker stay private.
7. Verify the public web in a logged-out browser, reviewer authentication,
   historical V1/V2 reports and images, denied unauthenticated API/worker access,
   and preserved accounting. Any live model canary needs an authorized bounded
   reservation; fixture acceptance does not replace this verification.

## Approved live transfer

The cutover transferred the **existing**, locally configured values to
these secrets in the dedicated project, without printing values:

| Secret | Use | Runtime access |
| --- | --- | --- |
| `proofpath-model-api-key` | Direct Meta Model API key | Web only |
| `proofpath-ledger-key` | Existing signed admission ledger key, base64 | Web; temporary import job |
| `proofpath-reviewer-pepper` | Existing reviewer-code verification pepper, base64 | Web only |
| `proofpath-reviewer-digests` | Existing allowed reviewer-code digests | Web only |

The raw reviewer access code and Baseten key are not part of this transfer.
The migration preserved all four reservations and the existing signed
policy. It also imported two V2 reports and five integrity-checked historical
V1 reports, assigning the historical V1 records to the one existing reviewer
identity. Historical approval timestamps use the report start time only for
the consumed local snapshot; those terminal jobs cannot execute again.

## Failure recovery

Never delete a lock, clear a planning activity record, reset a namespace or
reinitialize a ledger to get past an error. Preserve the source and receipts.
The live preparation script is intentionally one-shot: if it stops after
publishing `gcp-live.retired.json`, local admission stays disabled. Inspect the
phase and cloud resources and resume deliberately; do not rerun initialization
or remove the marker. An imported live namespace is never rolled back to a
fresh allowance. Existing source files and ledger remain local as evidence. Further local tests
must use fixture planning and a separate disposable `DATA_DIR`, never the retired
live paths.

The import script grants its job only temporary access to the ledger key; the
live deployment removes that grant after verification. An interrupted deploy
may leave that temporary grant and must be reconciled before declaring release.

The current repository adapter serializes bounded mutations with a 60-second
lease (up to 400 records; each JSON record at most 800 KB). This is appropriate
for the approved small reviewer demo. Larger scale needs a different storage
layout and narrower transactions, not higher instance limits alone.
