const $ = (selector) => document.querySelector(selector);
const status = $("#v2-status");
const setup = $("#v2-setup");
const requirement = $("#v2-requirement");
const baseline = $("#v2-baseline");
const candidate = $("#v2-candidate");
const propose = $("#v2-propose");
const review = $("#v2-review");
const reviewOutput = $("#v2-review-output");
const decisions = $("#v2-decisions");
const reviewSubmit = $("#v2-review-submit");
const approval = $("#v2-approval");
const approvalOutput = $("#v2-approval-output");
const approve = $("#v2-approve");
const run = $("#v2-run");
const report = $("#v2-report");
const reportOutput = $("#v2-report-output");
const refreshReport = $("#v2-report-refresh");
const save = $("#v2-save");
const downloads = $("#v2-downloads");
const saved = $("#v2-saved");
const refreshSaved = $("#v2-refresh-saved");
const prepare = $("#v2-prepare");
const reviewerCode = $("#v2-reviewer-code");
const reviewerCodeLabel = $("#v2-reviewer-code-label");
const controlledNote = $("#v2-controlled-note");
const modeLabel = $("#v2-mode-label");
const unlock = $("#v2-unlock");
const unlockCard = $("#v2-unlock-card");
let controlledLive = false;
let liveProviderLabel = "Meta Model API";
const provenanceLabel = (entries) => entries?.includes("baseten-mocked") ? "Demo plan · no live model call" : entries?.some((item) => item.startsWith("baseten-")) ? "Baseten-hosted Meta active · Muse Spark Open" : entries?.some((item) => item.startsWith("meta-responses")) ? "Meta AI active · Muse Spark 1.3" : entries?.some((item) => item.startsWith("fixture")) ? "Demo plan · no Meta call" : "Planner identity not recorded";
let version = 0;
let pending = false;
let proposal;
let suite;
let receipt;
let latestRun;
let activeRunId;
const id = /^[a-f0-9-]{36}$/;
const text = (value) => value === undefined ? "Not recorded" : value === null ? "Recorded none" : typeof value === "object" ? Object.entries(value).map(([key, item]) => `${key}: ${text(item)}`).join(", ") : String(value);
const node = (tag, value, className) => { const item = document.createElement(tag); if (className) item.className = className; if (value !== undefined) item.textContent = value; return item; };
const list = (items) => { const element = node("ol"); element.replaceChildren(...items.map((item) => node("li", item))); return element; };
const panel = (title, children, className = "") => { const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); const element = node("section", undefined, `workbench-panel panel-${slug} ${className}`.trim()); element.append(node("h3", title), ...children); return element; };
const raw = (title, value) => { const details = node("details", undefined, "raw-details"); details.append(node("summary", title), node("pre", JSON.stringify(value, null, 2))); return details; };
const disclosure = (title, children) => { const details = node("details", undefined, "workbench-panel"); details.append(node("summary", title), ...children); return details; };
function progress(index, message) { const steps = [...$("#v2-progress").children]; steps.forEach((step, i) => { step.classList.toggle("complete", i < index); step.classList.toggle("current", i === index); if (i === index) step.setAttribute("aria-current", "step"); else step.removeAttribute("aria-current"); }); $("#v2-progress-text").textContent = message || `Current step: ${steps[index].textContent}`; }
const setStatus = (message, step = setup) => { step.append(status); status.textContent = message; };
const labelled = (control, labelText, id) => { control.id = id; const label = node("label", labelText); label.htmlFor = id; return label; };
const protectedDownload = (link, filename) => { link.addEventListener("click", async (event) => { if (!controlledLive) return; event.preventDefault(); if (!reviewerCode.value) return setStatus("Enter the local reviewer access code before downloading protected evidence.", report); try { const response = await fetch(link.href, { headers: { Authorization: `Bearer ${reviewerCode.value}` } }); if (!response.ok) throw new Error("Protected download is unavailable."); const objectUrl = URL.createObjectURL(await response.blob()); const temporary = document.createElement("a"); temporary.href = objectUrl; temporary.download = filename; temporary.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 0); } catch (error) { setStatus(error.message, report); } }); };
const request = async (path, options = {}) => { const protectedRequest = controlledLive && path.startsWith("/api/v2/") && path !== "/api/v2/config"; const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(protectedRequest && reviewerCode.value ? { Authorization: `Bearer ${reviewerCode.value}` } : {}), ...(options.headers || {}) } }); const body = await response.json(); if (!response.ok) { const message = text(body.error || "Local request failed."); throw new Error(message.length > 300 || /browserType\.launch|<launching>|\n\s+at /i.test(message) ? "The local browser could not start. Check the runner and try again." : message); } return body; };
const pair = () => [baseline.value, candidate.value];
const update = () => { const locked = pending; [requirement, baseline, candidate, propose, reviewSubmit, approve, run, refreshReport, save, refreshSaved, prepare, saved, reviewerCode, unlock].forEach((control) => { control.disabled = locked || (control === run && (!receipt || !suite || receipt.digest !== suite.digest)) || (control === refreshReport && !activeRunId) || (control === save && !latestRun) || (control === reviewSubmit && !proposal) || (control === approve && !suite) || (control === prepare && !saved.value); }); };
const clear = (message) => { version += 1; proposal = undefined; suite = undefined; receipt = undefined; latestRun = undefined; activeRunId = undefined; review.hidden = true; approval.hidden = true; report.hidden = true; refreshReport.hidden = true; reviewOutput.replaceChildren(); decisions.replaceChildren(); approvalOutput.replaceChildren(); reportOutput.replaceChildren(); downloads.replaceChildren(); progress(0); if (message) setStatus(message, setup); update(); };
const validPair = () => baseline.value !== candidate.value;
const releaseText = (release) => `${release.id}: ${release.documentPath} (${release.fingerprint})`;
function renderProposal(data) {
  proposal = data;
  const candidateProposal = data.proposal;
  reviewOutput.replaceChildren(
    panel("Proposal at a glance", [node("p", provenanceLabel(data.provenance), "status-chip"), node("p", candidateProposal.requirement.originalText, "proposal-source"), node("p", `${candidateProposal.requirement.criteria.length} requirements · ${candidateProposal.cases.length} cases · ${candidateProposal.gaps.length} coverage gaps`, "proposal-metrics")], "proposal-summary"),
    disclosure("Inspect bounded cases and independently derived expectations", [list(candidateProposal.cases.map((item) => `${item.id}: ${item.rationale}; actions ${item.actions.map((action) => action.kind + ":" + action.target).join(", ")}; assertions ${item.assertions.map((assertion) => assertion.predicate).join(", ")}`))]),
    panel("Visible coverage gaps", [candidateProposal.gaps.length ? list(candidateProposal.gaps) : node("p", "No coverage gaps were returned for this finite fixture vocabulary.")], "coverage-callout"),
    disclosure("Registered inspection and exact proposal", [list(data.context.grounding.releases.map(releaseText)), node("p", `Observed common controls: ${data.context.grounding.observedTargets.join(", ") || "none"}.`), raw("Open exact prepared proposal", data)])
  );
  decisions.replaceChildren(...candidateProposal.requirement.criteria.map((criterion) => {
    const item = node("fieldset", undefined, "workbench-panel criterion-card"); const prefix = `criterion-${criterion.id}`;
    const interpretation = document.createElement("input"); interpretation.value = criterion.normalizedRule; interpretation.readOnly = true; interpretation.dataset.criterion = criterion.id;
    const accepted = document.createElement("input"); accepted.type = "checkbox"; accepted.dataset.accept = criterion.id;
    const scope = document.createElement("select"); scope.dataset.scope = criterion.id; scope.append(new Option("Select scope", ""), new Option("Unchanged", "unchanged"), new Option("New or changed", "new-or-changed"));
    const reference = document.createElement("input"); reference.type = "checkbox"; reference.dataset.reference = criterion.id; reference.value = "checkout-reference-v2";
    item.append(node("legend", `${criterion.id}: ${criterion.sourceQuote}`), labelled(interpretation, `Interpreted rule for ${criterion.id}`, `${prefix}-interpretation`), interpretation, labelled(accepted, `Accept interpretation for ${criterion.id}`, `${prefix}-accept`), accepted, labelled(scope, `Scope for ${criterion.id}`, `${prefix}-scope`), scope, labelled(reference, `Adopt checkout reference for ${criterion.id}`, `${prefix}-reference`), reference);
    for (const [index, change] of candidateProposal.requirement.numericRuleChanges.filter((change) => change.criterionId === criterion.id).entries()) { const numeric = document.createElement("input"); numeric.type = "checkbox"; numeric.dataset.numeric = criterion.id; numeric.value = JSON.stringify(change); item.append(labelled(numeric, `Accept ${change.field} change for ${criterion.id}: ${data.context.rules[change.field]} to ${change.value}`, `${prefix}-numeric-${index}`), numeric); }
    for (const [index, gap] of candidateProposal.gaps.entries()) { const gapCheck = document.createElement("input"); gapCheck.type = "checkbox"; gapCheck.dataset.gap = criterion.id; gapCheck.value = gap; item.append(labelled(gapCheck, `Accept coverage gap for ${criterion.id}: ${gap}`, `${prefix}-gap-${index}`), gapCheck); }
    return item;
  }));
  review.hidden = false; progress(1); $("#v2-review-heading").focus(); update();
}
function renderPrepared(data, label) {
  receipt = undefined; latestRun = undefined; downloads.replaceChildren(); report.hidden = true; suite = data;
  const readableCases = data.definition.cases.map((item, index) => panel(`${item.id}: ${item.category}`, [node("p", `${item.rationale}; criteria: ${item.criterionIds.join(", ")}`), list(item.actions.map((action) => `${action.id}: ${action.kind} ${action.target} = ${text(action.value)}`)), list(item.assertions.map((assertion) => `${assertion.id}: ${assertion.predicate}; expected ${text(data.expectations[index])}`))]));
  approvalOutput.replaceChildren(panel(label, [node("p", provenanceLabel(data.provenance)), node("p", `This plan covers ${data.definition.cases.length} checks across ${data.definition.requirement.criteria.length} reviewed requirements.`), node("p", `Known coverage gaps: ${data.definition.requirement.coverageGaps.join("; ") || "none"}.`), disclosure("Open technical plan details", [node("p", `Digest: ${data.digest}`), node("p", `Rules: ${text(data.definition.rules)}`), node("p", `Reviewed requirements: ${data.definition.requirement.criteria.map((criterion) => `${criterion.id}: ${criterion.sourceQuote}`).join("; ")}`), node("p", `Review decisions: ${data.definition.requirement.expectationScope.map((item) => `${item.criterionId}=${item.scope}`).join(", ")}`), list(data.definition.releases.map(releaseText)), ...readableCases, raw("Open exact unapproved snapshot", data)])]));
  approval.hidden = false; progress(2); $("#v2-approval-heading").focus(); update();
}
function outcomeNextAction(data) {
  if (data.status === "interrupted") return "The run was interrupted. Reopen or refresh the report after investigating the recorded evidence.";
  if (data.status !== "completed") return "The run is still active. Refresh this report later without proposing again.";
  if (data.verdict === "FAIL" || data.candidateVerdict === "FAIL") return "Review the failed candidate evidence and use the bug packet to guide the fix.";
  if (data.verdict === "INCONCLUSIVE") return "Review the accepted coverage gaps before treating the candidate result as complete.";
  return "The paired evidence supports this reviewed result; save or export it when ready.";
}
function renderRun(data, { focus = false } = {}) {
  activeRunId = data.id;
  latestRun = data;
  const recorded = panel("Recorded run snapshot", [node("p", provenanceLabel(data.artifact.provenance)), node("p", `Baseline ${data.artifact.definition.releases[0].id}; candidate ${data.artifact.definition.releases[1].id}.`), node("p", `Approval digest: ${data.approvalDigest}`), node("p", `Source: ${data.artifact.definition.requirement.originalText}`), node("p", "The proposal controls above select inputs for a new suite; this report describes the recorded snapshot.")]);
  const result = panel("Outcome summary", [node("p", `Run status: ${data.status}.`, "run-status"), node("p", `Candidate verdict: ${data.candidateVerdict}.`, "candidate-verdict"), node("p", `Suite verdict: ${data.verdict}.`, "suite-verdict"), node("p", outcomeNextAction(data), "next-action")], "outcome-summary"); result.classList.add(`outcome-${String(data.verdict).toLowerCase()}`);
  const comparison = panel("Per-case comparison", [data.comparisons.length ? list(data.comparisons.map((item) => `${item.caseId}: ${item.classification}`)) : node("p", "Comparison is pending.")]);
  const coverage = panel("Coverage", [data.coverage.length ? list(data.coverage) : node("p", "No accepted coverage gaps recorded.")]);
  const issues = [];
  for (const record of data.records.filter((item) => item.releaseId === data.artifact.definition.releases[1].id)) {
    for (const assertion of record.assertions.filter((item) => item.verdict === "FAIL" || item.verdict === "INCONCLUSIVE")) {
      const observed = assertion.observed === null && assertion.verdict === "INCONCLUSIVE" ? "Unavailable observation" : text(assertion.observed);
      const entry = node("li", `${record.caseId}: ${assertion.id} ${assertion.verdict}; expected ${text(assertion.expected)}; observed ${observed}.`);
      if (id.test(data.id) && /^[a-z0-9-]+\.png$/.test(assertion.screenshot) && assertion.screenshotSha256) { const link = node("a", "Open verified screenshot"); link.href = `/api/v2/runs/${data.id}/evidence/${assertion.screenshot}`; protectedDownload(link, assertion.screenshot); entry.append(document.createTextNode(" "), link); }
      issues.push(entry);
    }
  }
  const issueList = node("ul"); issueList.replaceChildren(...issues);
  const highlights = panel("Candidate checks needing attention", [issues.length ? issueList : node("p", data.status === "completed" ? "No failed or inconclusive candidate assertions were recorded." : data.status === "interrupted" ? "No failed or inconclusive candidate assertions were recorded before interruption; evidence may be incomplete." : "Results are still being collected; check the final report.")], issues.length ? "candidate-regression" : "candidate-clear");
  const observationList = node("ol");
  observationList.replaceChildren(...data.records.map((item) => { const entry = node("li", `${item.caseId} / ${item.releaseId}: ${item.verdict}`); const details = node("ul"); details.replaceChildren(...item.assertions.map((assertion) => { const observed = assertion.observed === null ? assertion.verdict === "INCONCLUSIVE" ? "Unavailable observation" : "Recorded none" : text(assertion.observed); const line = node("li", `${assertion.id} ${assertion.verdict}; expected ${text(assertion.expected)}; observed ${observed}; ${assertion.timestamp}; ${assertion.url}`); if (id.test(data.id) && /^[a-z0-9-]+\.png$/.test(assertion.screenshot) && assertion.screenshotSha256) { const link = node("a", "Open verified screenshot"); link.href = `/api/v2/runs/${data.id}/evidence/${assertion.screenshot}`; protectedDownload(link, assertion.screenshot); line.append(document.createTextNode(" "), link); } return line; })); entry.append(details); return entry; }));
  const observations = panel("Observed paired records", [observationList, raw("Open raw run data", data)]);
  reportOutput.replaceChildren(result, highlights, recorded, comparison, coverage, observations);
  downloads.replaceChildren();
  if (id.test(data.id)) {
    const reopen = node("a", "Open this report"); reopen.href = `/workbench.html?run=${data.id}`;
    const packet = node("a", "Download bug packet"); packet.href = `/api/v2/runs/${data.id}/bug-packet`; packet.download = "";
    const exportFile = node("a", "Download Playwright export"); exportFile.href = `/api/v2/runs/${data.id}/playwright.test.mjs`; exportFile.download = "";
    protectedDownload(packet, `proofpath-${data.id}.md`); protectedDownload(exportFile, `proofpath-${data.id}.test.mjs`); downloads.append(reopen, document.createTextNode(" · "), packet, document.createTextNode(" · "), exportFile);
  }
  report.hidden = false; progress(3, data.status === "completed" || data.status === "interrupted" ? `Results: ${data.status}` : `Running the comparison: ${data.status}`); if (focus) $("#v2-report-heading").focus(); update();
  refreshReport.hidden = false;
}
async function poll(runId, runVersion) { const deadline = Date.now() + 195_000; activeRunId = runId; while (Date.now() < deadline) { const current = await request(`/api/v2/runs/${runId}`); if (runVersion !== version) return undefined; const terminal = current.status === "completed" || current.status === "interrupted"; renderRun(current, { focus: terminal }); if (terminal) return current; await new Promise((resolve) => setTimeout(resolve, 250)); } if (runVersion === version) setStatus("The persisted run is still active; refresh this report later without proposing again.", report); return undefined; }
requirement.addEventListener("input", () => clear("Inputs changed. Propose and review a new snapshot."));
reviewerCode.addEventListener("input", () => clear("Access code changed. Open the protected workbench or request a new proposal."));
unlock.addEventListener("click", async () => {
  if (pending) return;
  if (!reviewerCode.value) return setStatus("Enter the local reviewer access code.", setup);
  const current = version; pending = true; update();
  try {
    await loadSaved();
    const requested = new URLSearchParams(location.search).get("run");
    if (requested && id.test(requested)) {
      const data = await request(`/api/v2/runs/${requested}`);
      if (current !== version) return;
      renderRun(data, { focus: true }); setStatus("Loaded persisted read-only run report.", report);
    } else if (current === version) { unlockCard.hidden = true; setStatus("Meta testing is unlocked. Describe what to test, then generate a test plan.", setup); }
  } catch (error) { if (current === version) setStatus(error.message, setup); }
  finally { pending = false; update(); }
});
baseline.addEventListener("change", () => clear("Release pair changed. Propose and review a new snapshot."));
candidate.addEventListener("change", () => clear("Release pair changed. Propose and review a new snapshot."));
saved.addEventListener("change", update);
propose.addEventListener("click", async () => { if (pending) return; if (!validPair()) return setStatus("Choose two different releases.", setup); if (controlledLive && !reviewerCode.value) return setStatus("Unlock Meta testing before generating a test plan.", setup); const current = version; pending = true; update(); try { setStatus(controlledLive ? "Checking your Meta testing budget and generating a test plan…" : "Generating a demo test plan…", setup); const data = await request("/api/v2/proposals", { method: "POST", body: JSON.stringify({ requirement: requirement.value, releases: pair() }) }); if (current !== version) return; if (data.kind === "clarification") { setStatus(`More detail is needed: ${data.gaps.join(" ")}`, setup); return; } renderProposal(data); setStatus("Review the proposed checks and any coverage gaps before continuing.", review); } catch (error) { if (current === version) setStatus(error.message, setup); } finally { pending = false; update(); } });
reviewSubmit.addEventListener("click", async () => { if (pending || !proposal) return; const criteria = proposal.proposal.requirement.criteria; for (const criterion of criteria) { const acceptance = decisions.querySelector(`[data-accept="${criterion.id}"]`); const scope = decisions.querySelector(`[data-scope="${criterion.id}"]`); if (!acceptance.checked) { acceptance.focus(); return setStatus(`Accept the interpretation for ${criterion.id} before continuing.`, review); } if (!scope.value) { scope.focus(); return setStatus(`Choose whether ${criterion.id} is unchanged or new before continuing.`, review); } } const missingNumeric = [...decisions.querySelectorAll("[data-numeric]")].find((input) => !input.checked); if (missingNumeric) { missingNumeric.focus(); return setStatus(`Accept the required rule change for ${missingNumeric.dataset.numeric} before continuing.`, review); } const reviewed = criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: decisions.querySelector(`[data-criterion="${criterion.id}"]`).value, scope: decisions.querySelector(`[data-scope="${criterion.id}"]`).value, adoptedReferenceIds: decisions.querySelector(`[data-reference="${criterion.id}"]`).checked ? ["checkout-reference-v2"] : [], acceptedGaps: [...decisions.querySelectorAll(`[data-gap="${criterion.id}"]:checked`)].map((input) => input.value), acceptedNumericRuleChanges: [...decisions.querySelectorAll(`[data-numeric="${criterion.id}"]:checked`)].map((input) => JSON.parse(input.value)) })); const current = version; pending = true; update(); try { const data = await request(`/api/v2/proposals/${proposal.id}/review`, { method: "POST", body: JSON.stringify({ review: { decisions: reviewed } }) }); if (current !== version) return; renderPrepared(data, "Test plan ready for approval"); setStatus("Approve this exact plan before it can run.", approval); } catch (error) { if (current === version) setStatus(error.message, review); } finally { pending = false; update(); } });
approve.addEventListener("click", async () => { if (pending || !suite) return; const current = version; pending = true; update(); try { const next = await request(`/api/v2/suites/${suite.id}/approve`, { method: "POST", body: "{}" }); if (current !== version || next.digest !== suite.digest) return; receipt = next; approvalOutput.append(node("p", "Approval recorded for this exact test plan.")); setStatus("Approval recorded. Run the approved test when ready.", approval); } catch (error) { if (current === version) setStatus(error.message, approval); } finally { pending = false; update(); } });
run.addEventListener("click", async () => { if (pending) return; if (!receipt || !suite || receipt.digest !== suite.digest) return setStatus("Approve the displayed test plan before running.", approval); const current = version; pending = true; update(); try { setStatus("Running the comparison…", approval); const started = await request(`/api/v2/approvals/${receipt.id}/runs`, { method: "POST", body: "{}" }); receipt = undefined; const terminal = await poll(started.runId, current); if (terminal && current === version) setStatus(terminal.status === "interrupted" ? "The run was interrupted; inspect or refresh the recorded evidence before taking the next step." : "Run completed. Review the result, then save or download the evidence if useful.", report); } catch (error) { if (current === version) setStatus(error.message, approval); } finally { pending = false; update(); } });
refreshReport.addEventListener("click", async () => { if (pending || !activeRunId) return; const current = version; pending = true; update(); try { const data = await request(`/api/v2/runs/${activeRunId}`); if (current !== version) return; renderRun(data, { focus: true }); setStatus("Refreshed persisted read-only run report.", report); } catch (error) { if (current === version) setStatus(error.message, report); } finally { pending = false; update(); } });
save.addEventListener("click", async () => { if (pending || !latestRun || !id.test(latestRun.id)) return; pending = true; update(); try { const result = await request(`/api/v2/runs/${latestRun.id}/regressions`, { method: "POST", body: "{}" }); await loadSaved(); setStatus(`Saved immutable regression ${result.id}.`, report); } catch (error) { setStatus(error.message, report); } finally { pending = false; update(); } });
async function loadSaved() { const entries = await request("/api/v2/regressions"); saved.replaceChildren(node("option", "No saved definition selected")); saved.options[0].value = ""; for (const entry of entries) { const option = node("option", `${entry.id}: ${entry.definition.requirement.originalText.slice(0, 72)}`); option.value = entry.id; saved.append(option); } update(); }
refreshSaved.addEventListener("click", async () => { if (pending) return; pending = true; update(); try { await loadSaved(); setStatus("Saved definitions refreshed without invoking the planner.", setup); } catch (error) { setStatus(error.message, setup); } finally { pending = false; update(); } });
prepare.addEventListener("click", async () => { if (pending) return; if (!saved.value || !validPair()) return setStatus("Select a saved definition and two different registered releases.", setup); receipt = undefined; update(); const current = version; pending = true; update(); try { const data = await request(`/api/v2/regressions/${saved.value}/prepare`, { method: "POST", body: JSON.stringify({ releases: pair() }) }); if (current !== version) return; renderPrepared(data, "Saved immutable definition rebound to the selected pair"); setStatus("Saved reuse made zero planner calls. A fresh final approval is required.", approval); } catch (error) { if (current === version) setStatus(error.message, setup); } finally { pending = false; update(); } });
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !propose.disabled) { event.preventDefault(); propose.click(); } });
progress(0);
(async () => {
  try {
    const config = await request("/api/v2/config");
    controlledLive = config.authenticationRequired === true || config.mode === "controlled-live" || config.mode === "controlled-meta";
    liveProviderLabel = config.planner?.provider === "baseten" ? "Baseten-hosted Meta" : "Meta Model API";
    unlockCard.hidden = !controlledLive;
    if (controlledLive) {
      modeLabel.textContent = config.planner?.provider === "baseten" ? "Baseten-hosted Meta active · Muse Spark Open" : "Meta AI active · Muse Spark 1.3";
      const limits = config.proposalLimit;
      controlledNote.textContent = `Your access code stays only in this browser tab. Plan limits: ${limits.perCode} per code and ${limits.total} total; US$${limits.reservationUsd} is reserved per plan. ${config.planner?.schemaEnforcement === "local" ? "ProofPath validates model output locally before review. " : ""}`;
      propose.textContent = "Generate test plan with Meta";
    }
    if (!controlledLive) await loadSaved();
    const requested = new URLSearchParams(location.search).get("run");
    if (!controlledLive && requested && id.test(requested)) {
      activeRunId = requested; renderRun(await request(`/api/v2/runs/${requested}`), { focus: true });
      setStatus("Loaded persisted read-only run report.", report);
    } else setStatus(controlledLive ? "Enter the local reviewer access code to unlock Meta testing." : "Demo mode is ready. No Meta call will be made.", setup);
  } catch { setStatus("Saved definitions are unavailable until the local runtime is ready.", setup); }
})();
