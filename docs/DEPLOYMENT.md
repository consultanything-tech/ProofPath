# Guarded container deployment

This packages the existing direct-Meta V2 workbench for a single managed
container with persistent storage. It does not provision hosting. The local
development command remains `pnpm dev`; the production entry point is
`pnpm build` followed by `pnpm start`.

## Runtime configuration

| Setting | Hosted value |
| --- | --- |
| `PROOFPATH_RUNTIME` | `hosted` |
| `PUBLIC_ORIGIN` | Exact HTTPS origin, e.g. `https://proofpath.example`; no trailing slash, path or credentials |
| `PORT` | Public listener's decimal TCP port, default `3000` |
| `FIXTURE_PORT` | Separate loopback port, default `4173` |
| `DATA_DIR` | Absolute persistent root, proposed `/var/data/proofpath` |
| `V2_OPERATOR_DIR` | Existing private operator inside that root, e.g. `/var/data/proofpath/operator` |
| `V2_PLANNER_MODE` | `meta` for reviewers; `fixture` only for isolated validation |
| `MODEL_API_KEY` | Existing key, provided through the host's runtime secret store |

Keep one instance. Scaling horizontally would create independent in-memory
gates and is not supported by this filesystem authority. The approved reviewer
limits remain 3 proposals/code, 50 globally, US$0.05 retained/proposal and
US$2.50 total. This is service admission, not account-wide invoice reconciliation.
Baseten is not enabled in hosted mode by this change.

## Ingress and browser boundary

The public listener binds `0.0.0.0` and accepts only the configured Host and
same-origin mutations. Provided Origin headers must also match. Forwarded
headers cannot override either origin. The managed host terminates HTTPS;
actual public TLS and ingress behavior require verification after provisioning.

Only the V2 workbench and its protected API are exposed. Hosted V1 APIs,
legacy evidence and public `/v2-target/*` routes are disabled. The separate
`127.0.0.1:FIXTURE_PORT` listener serves only registered checkout documents and
scripts. Inspection and execution use this loopback origin with their existing
network allowlists. Historical evidence keeps the observed loopback URLs.

`/healthz` returns a minimal status only after storage validation and interrupted
job recovery complete. The container health script connects locally but sends
the exact configured public Host. Verify the managed host's health-request Host
matches before enabling reviewer access; do not solve a mismatch by accepting
arbitrary forwarded hosts.

## Persistent state and cutover

The runtime runs as UID 1000. Provision the mounted volume with appropriate
ownership and preserve restrictive operator-file permissions. The container
does not recursively change ownership of an existing volume or initialize a
fresh live budget.

Expected layout:

```text
/var/data/proofpath/
  runs/v2/state.json
  runs/v2/<run-id>/...
  operator/...
```

Before real deployment, stop the original owner cleanly and securely transfer
the existing application data and private operator together, preserving the
consumed Meta reservation and completed evidence. Operator material includes
secrets: keep it out of Git, image build context, logs and chat. Do not copy
running state, remove unexplained locks, initialize another quota pool, or
silently run the shared-ledger migration. Inspect any retained ownership lock
before proceeding.

Live startup requires existing valid writable state and an operator whose real
path stays inside the persistent root. Missing, corrupt, unwritable or escaped
state prevents readiness. A write/fsync probe establishes current writability;
it does not prove a disk is persistent across host replacement. Verify the
actual mount and a service restart on the selected host.

Explicit fixture validation may initialize only an empty disposable data
directory. Its marker separates it from live data; either profile refuses to
open the other's data. Never delete that marker to turn a validation volume
into a live one. Use the correct live data set instead.

On shutdown, ingress stops admitting work and active inspections/execution
drain before the fixture and operator close. A drain timeout retains ownership
for investigation. Configure the managed host's termination grace period to
cover active requests and reviewed suite deadlines; forced termination can
leave interrupted jobs and an ownership lock. Pending proposals/approvals are
ephemeral and are not restored after restart; completed reports and quota state
are durable.

## Container validation

The Dockerfile uses Node 26, pnpm 11.8.0 and the lockfile's Playwright/Chromium
1.64.1. Linux browser dependencies are installed inside the image; local macOS
dependencies and browser caches are excluded. The build context is allowlisted
and excludes credentials, private runs, logs and Git history.

Local source verification:

```sh
pnpm typecheck
pnpm test
pnpm test:deployment
pnpm test:safety
pnpm test:ui
pnpm test:v2:browser
```

The user has no local Docker runtime. The private repository's
[container workflow](../.github/workflows/container-validation.yml) runs on an
explicit `codex/deployment-validation-*` branch push, or manual dispatch once
registered. It builds the Linux image, starts a non-root fixture service on a
disposable bind mount with `--network none`, checks listener isolation and real
Chromium checkout interaction, restarts it, and verifies the state hash and
health again. It receives no model keys, publishes no image, and deploys no
service. A local Chromium pass is separate from this Linux image result.

## Remaining hosted release gates

Select the actual managed host and review its current account, tier, full quote,
disk and termination behavior before paid provisioning. Render remains a
reference candidate, not an approved purchase. Its [Docker support](https://render.com/docs/docker)
and [persistent-disk documentation](https://render.com/docs/disks) establish
capability; a specific service still requires configuration and verification.

After provisioning and secure state transfer, verify public HTTPS, protected
reports, wrong-origin/unauthorized/exhausted denial, evidence survival through
restart and one separately authorized bounded live UI journey. Record the real
approval source. A fixture CI run, model-access greeting or report gallery does
not replace that hosted product evidence. Public repository, demo video and
final submission work remain separate gates.
