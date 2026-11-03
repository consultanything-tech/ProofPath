const status = document.querySelector("#status");
const review = document.querySelector("#review");
const run = document.querySelector("#run");
const report = document.querySelector("#report");
const reviewOutput = document.querySelector("#review-output");
const reportOutput = document.querySelector("#report-output");
const scenario = document.querySelector("#scenario");
const revision = document.querySelector("#revision");
const requirement = document.querySelector("#requirement");
const planButton = document.querySelector("#plan");
const approveButton = document.querySelector("#approve");
const executeButton = document.querySelector("#execute");
const reviewerAccess = document.querySelector("#reviewer-access");
const reviewerCode = document.querySelector("#reviewer-code");
const inputs = [scenario, revision, requirement];
const runIdPattern = /^[a-f0-9-]{36}$/;
const screenshotPattern = /^[a-z0-9-]+\.png$/;
let planId;
let inputVersion = 0;
let plannerReady = false;
let proposalPending = false;
let approvalPending = false;
let runPending = false;
let approved = false;
let authenticationRequired = false;
let savedReportId;

const setStatus = (message) => { status.textContent = message; };
const text = (value) => typeof value === "string" ? value : value === null || value === undefined ? "Not recorded" : String(value);
const node = (tag, value, className) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = value;
  return item;
};
const makeList = (items, className) => {
  const list = node("ol", undefined, className);
  list.replaceChildren(...items.map((item) => node("li", item)));
  return list;
};
const panel = (title, children) => {
  const item = node("section", undefined, "report-panel");
  item.append(node("h3", title), ...children);
  return item;
};
const rawDetails = (summary, value) => {
  const details = node("details", undefined, "raw-details");
  details.append(node("summary", summary), node("pre", JSON.stringify(value, null, 2)));
  return details;
};
const plannerName = (planner) => planner?.mode === "baseten" ? "Baseten-hosted Meta open-weight model — muse-spark-open-1026" : planner?.mode === "meta" ? "Meta Model API — muse-spark-1.3" : "Fixture planner — Meta not used";
const journeyName = (id) => ({ "add-to-cart": "Add to cart", "quantity-update": "Quantity update", "required-fields": "Required checkout fields" })[id] ?? text(id);
const revisionName = (id) => ({ baseline: "Baseline", "seeded-bug": "Seeded quantity defect", fixed: "Fixed quantity defect" })[id] ?? text(id);
const safeRunId = (value) => typeof value === "string" && runIdPattern.test(value);
const safeScreenshot = (value) => typeof value === "string" && screenshotPattern.test(value);
const formatTime = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : "Not recorded";
const formatMoney = (minor) => {
  if (!/^(0|[1-9]\d*)$/.test(text(minor))) return text(minor);
  const cents = Number(minor);
  return Number.isSafeInteger(cents) ? `S$${(cents / 100).toFixed(2)}` : text(minor);
};
const actionText = (action) => {
  if (action?.kind === "navigate" && action.target === "shop") return "Open the synthetic shop.";
  if (action?.kind === "click" && action.target === "add-desk-lamp") return "Add Desk Lamp to the cart.";
  if (action?.kind === "fill" && action.target === "quantity") return `Set quantity to ${text(action.value)}.`;
  if (action?.kind === "click" && action.target === "checkout") return "Open checkout.";
  if (action?.kind === "click" && action.target === "continue-checkout") return "Continue checkout.";
  return `${text(action?.kind)} ${text(action?.target)}.`;
};
const checkText = (assertion, observed) => {
  const value = observed === undefined ? assertion.expected : observed;
  if (assertion.predicate === "cart-quantity-equals") return `Cart quantity is ${text(value)}.`;
  if (assertion.predicate === "cart-total-minor-equals") return `Cart total is ${formatMoney(value)}.`;
  if (assertion.predicate === "required-errors-visible") return value === "true" ? "Both required-field errors are visible." : "Required-field errors are not both visible.";
  if (assertion.predicate === "checkout-stayed") return value === "true" ? "Checkout remains active." : "Checkout does not remain active.";
  return `${text(assertion.predicate)}: ${text(value)}.`;
};
const updateControls = () => {
  const lockInputs = approvalPending || runPending;
  inputs.forEach((input) => { input.disabled = lockInputs; });
  revision.disabled = lockInputs || scenario.value !== "quantity-update";
  planButton.disabled = !plannerReady || (authenticationRequired && !reviewerCode.value.trim()) || proposalPending || approvalPending || runPending;
  approveButton.disabled = approvalPending || runPending || approved || !planId;
  executeButton.disabled = runPending || approvalPending || !approved || !planId;
};
const clearPlan = (message) => {
  inputVersion += 1;
  planId = undefined;
  approved = false;
  review.hidden = true;
  run.hidden = true;
  report.hidden = true;
  reviewOutput.replaceChildren();
  reportOutput.replaceChildren();
  if (message) setStatus(message);
  updateControls();
};
const syncJourney = () => {
  const quantity = scenario.value === "quantity-update";
  if (scenario.value === "add-to-cart") { revision.value = "baseline"; requirement.value = "Add one Desk Lamp; cart quantity is 1 and total is S$39."; }
  if (quantity && revision.value === "baseline") revision.value = "seeded-bug";
  if (quantity) requirement.value = "Change Desk Lamp quantity to 2; total is S$78.";
  if (scenario.value === "required-fields") { revision.value = "baseline"; requirement.value = "Continue checkout with required fields blank; show both validation errors and stay on checkout."; }
  updateControls();
};
const request = async (url, options = {}) => {
  const headers = { "Content-Type": "application/json", ...(authenticationRequired && reviewerCode.value.trim() ? { Authorization: `Bearer ${reviewerCode.value.trim()}` } : {}), ...(options.headers || {}) };
  const response = await fetch(url, { ...options, headers });
  let data;
  try { data = await response.json(); } catch { throw new Error("The local server returned an unreadable response."); }
  if (!response.ok) throw new Error(text(data?.error || "Request failed."));
  return data;
};

const renderReview = (data) => {
  const envelope = data.envelope;
  const plan = envelope.plan;
  const currentScenario = envelope.scenario;
  reviewOutput.replaceChildren(
    panel("What will run", [
      node("p", `Requirement: ${text(envelope.originalRequirement)}`),
      node("p", `Journey: ${journeyName(currentScenario.id)} — ${revisionName(currentScenario.revision)}`),
      node("p", `Planner: ${plannerName(envelope.planner)}`)
    ]),
    panel("Steps to run", [makeList(plan.actions.map(actionText), "steps")]),
    panel("Checks", [makeList(plan.assertions.map((assertion) => checkText(assertion)), "checks")]),
    panel("Approval snapshot", [
      node("p", `Digest: ${text(data.digest)}`, "digest"),
      rawDetails("Open exact approval envelope and digest", { approvalEnvelope: envelope, approvalDigest: data.digest })
    ])
  );
  review.hidden = false;
  document.querySelector("#review-heading").focus();
};
const renderAction = (result, action) => {
  const item = node("li", undefined, "action-result");
  item.append(node("strong", `${text(result.status).toUpperCase()} — ${action ? actionText(action) : text(result.id)}`));
  item.append(node("p", `Started: ${formatTime(result.startedAt)}. Ended: ${formatTime(result.endedAt)}.`));
  if (result.url) item.append(node("p", `Observed URL: ${text(result.url)}`));
  if (result.error) item.append(node("p", `Detail: ${text(result.error)}`));
  return item;
};
const renderAssertion = (manifest, assertion, plannedAssertion) => {
  const descriptor = plannedAssertion ?? assertion;
  const card = node("article", undefined, "assertion-card");
  card.append(node("h4", `${text(assertion.verdict)} — ${text(assertion.id)}`));
  card.append(node("p", `Expected: ${checkText(descriptor, assertion.expected)}`));
  card.append(node("p", `Observed: ${assertion.observed === null || assertion.observed === undefined ? "Missing observation." : checkText(descriptor, assertion.observed)}`));
  card.append(node("p", `URL: ${text(assertion.url)}. Recorded: ${formatTime(assertion.timestamp)}.`));
  if (safeRunId(manifest.runId) && assertion.screenshot !== "not-captured.png" && safeScreenshot(assertion.screenshot)) {
    const image = document.createElement("img");
    image.dataset.evidence = `/evidence/${manifest.runId}/${assertion.screenshot}`;
    image.alt = `Screenshot evidence for ${text(assertion.id)}`;
    card.append(image);
  }
  return card;
};
const renderReport = (manifest) => {
  if (!safeRunId(manifest?.runId)) throw new Error("The report has an invalid run ID.");
  const overview = panel("Result", [
    node("p", `${text(manifest.verdict)} — execution ${text(manifest.executionStatus)}`, `verdict verdict-${String(manifest.verdict).toLowerCase()}`),
    node("p", `Planner: ${plannerName(manifest.planner)}.`),
    node("p", `Journey: ${journeyName(manifest.scenario?.id)} — ${revisionName(manifest.scenario?.revision)}.`),
    node("p", `Started: ${formatTime(manifest.startedAt)}. Ended: ${formatTime(manifest.endedAt)}.`),
    ...(manifest.executionError ? [node("p", `Execution detail: ${text(manifest.executionError)}`)] : [])
  ]);
  let actions;
  if (Array.isArray(manifest.actionResults)) {
    const byId = new Map(Array.isArray(manifest.approvalEnvelope?.plan?.actions) ? manifest.approvalEnvelope.plan.actions.map((action) => [action.id, action]) : []);
    const actionList = node("ol", undefined, "action-timeline");
    actionList.replaceChildren(...manifest.actionResults.map((result) => renderAction(result, byId.get(result.id))));
    actions = panel("Action timeline", [actionList]);
  } else {
    actions = panel("Action timeline", [node("p", "Action execution details were not recorded for this earlier run.")]);
  }
  const assertionById = new Map(Array.isArray(manifest.approvalEnvelope?.plan?.assertions) ? manifest.approvalEnvelope.plan.assertions.map((assertion) => [assertion.id, assertion]) : []);
  const assertionCards = Array.isArray(manifest.assertions) ? manifest.assertions.map((assertion) => renderAssertion(manifest, assertion, assertionById.get(assertion.id))) : [];
  const assertions = panel("Assertions", assertionCards.length ? assertionCards : [node("p", "No assertion records are available.")]);
  const replay = panel("Replay", [makeList(Array.isArray(manifest.replay) ? manifest.replay.map(text) : [], "replay")]);
  const links = panel("Evidence links", []);
  const share = document.createElement("a");
  share.href = `/?run=${manifest.runId}`;
  share.textContent = "Open this readable report";
  links.append(share, rawDetails("Open raw manifest data", manifest));
  reportOutput.replaceChildren(overview, actions, assertions, replay, links);
  report.hidden = false;
  for (const image of reportOutput.querySelectorAll("img[data-evidence]")) {
    fetch(image.dataset.evidence, { headers: authenticationRequired ? { Authorization: `Bearer ${reviewerCode.value.trim()}` } : {} }).then((response) => response.ok ? response.blob() : Promise.reject()).then((blob) => { image.src = URL.createObjectURL(blob); }).catch(() => { image.alt += " (unavailable)"; });
  }
  document.querySelector("#report-heading").focus();
};
const waitForReport = async (data, version) => {
  const deadline = Date.now() + 660_000;
  while (data.jobStatus) {
    if (version !== inputVersion) return null;
    if (!safeRunId(data.runId) || Date.now() >= deadline) throw new Error("Run is still pending; reopen this saved run to check its status.");
    setStatus(data.jobStatus === "running" ? "Running approved plan…" : "Approved run queued…");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    data = await request(`/api/v1/jobs/${data.runId}`);
  }
  return version === inputVersion ? data : null;
};
const loadSavedReport = async () => {
  if (!savedReportId || (authenticationRequired && !reviewerCode.value.trim())) return;
  setStatus("Loading saved report…");
  const reportVersion = inputVersion;
  try {
    const manifest = await waitForReport(await request(`/runs/${savedReportId}/manifest.json`), reportVersion);
    if (!manifest) return;
    renderReport(manifest);
    setStatus("Saved report loaded.");
  } catch {
    if (reportVersion === inputVersion) setStatus("Saved report is unavailable.");
  }
};

scenario.addEventListener("change", () => { syncJourney(); clearPlan("Inputs changed. Propose and approve a new plan."); });
revision.addEventListener("change", () => clearPlan("Inputs changed. Propose and approve a new plan."));
requirement.addEventListener("input", () => clearPlan("Inputs changed. Propose and approve a new plan."));
reviewerCode.addEventListener("input", () => { if (authenticationRequired) { clearPlan("Access code changed. Propose and approve a new plan."); void loadSavedReport(); } });
syncJourney();

planButton.addEventListener("click", async () => {
  clearPlan();
  const version = inputVersion;
  proposalPending = true;
  updateControls();
  try {
    setStatus("Planning…");
    const data = await request("/api/plans", { method: "POST", body: JSON.stringify({ requirement: requirement.value, scenarioId: scenario.value, revision: revision.value }) });
    if (version !== inputVersion) return;
    if (data.kind === "clarification") { setStatus(`${text(data.plannerLabel)}: ${text(data.question)}`); return; }
    planId = data.id;
    renderReview(data);
    setStatus(text(data.plannerLabel));
  } catch (error) {
    if (version === inputVersion) setStatus(error instanceof Error ? error.message : "Planning failed.");
  } finally {
    proposalPending = false;
    updateControls();
  }
});
approveButton.addEventListener("click", async () => {
  if (!planId || approvalPending) return;
  const version = inputVersion;
  approvalPending = true;
  updateControls();
  try {
    setStatus("Recording approval…");
    const data = await request(`/api/plans/${planId}/approve`, { method: "POST", body: "{}" });
    if (version !== inputVersion) return;
    approved = true;
    document.querySelector("#approval").textContent = `Approved ${text(data.digest)}; expires ${formatTime(data.expiresAt)}.`;
    run.hidden = false;
    setStatus("Approval recorded. One run is authorized.");
  } catch (error) {
    if (version === inputVersion) setStatus(error instanceof Error ? error.message : "Approval failed.");
  } finally {
    approvalPending = false;
    updateControls();
  }
});
executeButton.addEventListener("click", async () => {
  if (!planId || !approved || runPending) return;
  const version = inputVersion;
  runPending = true;
  updateControls();
  try {
    setStatus("Running approved plan…");
    let data = await request(`/api/plans/${planId}/run`, { method: "POST", body: "{}" });
    if (data.jobStatus && safeRunId(data.runId)) {
      savedReportId = data.runId;
      history.replaceState(null, "", `/?run=${savedReportId}`);
    }
    data = await waitForReport(data, version);
    if (!data) return;
    renderReport(data);
    run.hidden = true;
    planId = undefined;
    approved = false;
    setStatus(`Run ${text(data.executionStatus)}.`);
  } catch (error) {
    if (version === inputVersion) {
      clearPlan();
      setStatus(`${error instanceof Error ? error.message : "Run failed."} ${savedReportId ? "Reload this page to recover the saved run status before starting another run." : "Propose a new plan before retrying."}`);
    }
  } finally {
    runPending = false;
    updateControls();
  }
});

(async () => {
  try {
    const config = await request("/api/config");
    document.querySelector("#planner-label").textContent = text(config.plannerLabel);
    authenticationRequired = config.authenticationRequired === true;
    reviewerAccess.hidden = !authenticationRequired;
    document.querySelector("#planner-notice").textContent = config.planner?.mode === "fixture" ? "Fixture mode uses a fixed plan. It does not interpret the text or call Meta; review the plan and server-owned revision before approving it." : "The selected model proposes a constrained plan from your synthetic requirement. A proposal does not run the browser; review and approve each snapshot.";
    plannerReady = true;
    updateControls();
    const reportId = new URLSearchParams(location.search).get("run");
    if (reportId === null) return;
    if (!safeRunId(reportId)) { setStatus("The report link has an invalid run ID."); return; }
    savedReportId = reportId;
    if (authenticationRequired) { setStatus("Enter reviewer access code to load this protected report."); return; }
    await loadSavedReport();
  } catch (error) {
    setStatus(`Planner unavailable: ${error instanceof Error ? error.message : "Request failed."}`);
  }
})();
