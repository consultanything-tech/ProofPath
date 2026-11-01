# Deployment packaging and hardening — November 1, 2026

The user approved the next deployment-packaging step after the readiness review.
This implements a portable container and guarded hosted topology for the
existing direct-Meta V2 product. It does not authorize paid hosting provisioning,
public repository visibility, another model call or final hackathon filing.

## Bounded implementation

1. Separate configured canonical HTTPS ingress from the loopback fixture origin.
   Public Host/Origin must match exactly; forwarded headers confer no authority.
   Only registered target resources belong on the fixture listener. Hosted V1
   APIs and legacy evidence routes remain disabled.
2. Require existing writable application/operator state for hosted Meta, await
   interrupted-job recovery before readiness, and refuse missing/corrupt state.
   Preserve existing reservations, approvals/evidence semantics and the real
   private operator. Explicit fixture mode may use a disposable CI data set.
3. Serialize proposal/inspection work before expensive browser/provider activity.
   Drain active work before closing fixtures and releasing live ownership.
4. Package Node 26, pinned pnpm 11.8.0 and Chromium installed through locked
   Playwright 1.64.1. Run as UID 1000, keep build context restricted, and make
   health checks non-sensitive. Add no production npm dependency.
5. Validate local policy/runtime/Chromium regressions and a manual private
   GitHub Actions image job. CI uses fixture mode, a disposable bind mount and
   `--network none`, no model keys, no image publication and no deployment.

## Ownership

- Runtime implementer: server, V2 HTTP/store/runner, runtime-config and fixture
  helpers, related focused tests.
- Packaging implementer: Dockerfile, `.dockerignore`, container health script
  and its behavior tests.
- Primary: environment/package scripts, manual CI workflow and smoke script,
  integration verification, evidence and release documentation.

The six pre-existing uncommitted V1 Baseten code/test files belong to another
chat and are preserved. They are excluded from this change's commit. No fresh
reviewer codes, cookie/account system, shared-ledger migration, Baseten product
adaptation or paid resource is added by this step.

## Verification gates

- Typecheck/build and relevant unit, HTTP, safety and browser checks.
- Wrong Host/Origin, forwarded-header spoofing and legacy/fixture route isolation.
- Missing/corrupt/unwritable state refuses readiness; restart preserves state.
- Busy/unauthorized/exhausted requests perform no additional inspection/generation.
- Actual Linux image build, non-root startup, health and production Chromium
  inspection against the internal fixture; repeat after container restart.
- Existing Meta request serialization and private accounting remain unchanged.

No Docker runtime is installed locally, confirmed by the user. The existing
private GitHub repository has Actions enabled; a manual image-validation job is
prepared to cover the Linux gate. Local tests alone do not establish container
or managed-host behavior. Public HTTPS, real persistent-disk configuration,
account/tier/quote approval, secure state transfer and a bounded hosted live UI
walkthrough remain subsequent deployment gates.
