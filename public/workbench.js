const $ = (selector) => document.querySelector(selector);
const status = $("#v2-status");
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
let controlledLive = false;
let liveProviderLabel = "Meta Model API";
const provenanceLabel = (entries) => entries?.includes("baseten-mocked") ? "Baseten mock · no live model call" : entries?.some((item) => item.startsWith("baseten-")) ? "Baseten-hosted Meta · Muse Spark Open" : entries?.some((item) => item.startsWith("meta-responses")) ? "Meta Model API · Muse Spark 1.3" : entries?.some((item) => item.startsWith("fixture")) ? "Fixture planner · no live model call" : "Planner identity not recorded";
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
const panel = (title, children) => { const element = node("section", undefined, "workbench-panel"); element.append(node("h3", title), ...children); return element; };
const raw = (title, value) => { const details = node("details", undefined, "raw-details"); details.append(node("summary", title), node("pre", JSON.stringify(value, null, 2))); return details; };
const protectedDownload = (link, filename) => { link.addEventListener("click", async (event) => { if (!controlledLive) return; event.preventDefault(); if (!reviewerCode.value) return status.textContent = "Enter the local reviewer access code before downloading protected evidence."; try { const response = await fetch(link.href, { headers: { Authorization: `Bearer ${reviewerCode.value}` } }); if (!response.ok) throw new Error("Protected download is unavailable."); const objectUrl = URL.createObjectURL(await response.blob()); const temporary = document.createElement("a"); temporary.href = objectUrl; temporary.download = filename; temporary.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 0); } catch (error) { status.textContent = error.message; } }); };
const request = async (path, options = {}) => { const protectedRequest = controlledLive && path.startsWith("/api/v2/") && path !== "/api/v2/config"; const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(protectedRequest && reviewerCode.value ? { Authorization: `Bearer ${reviewerCode.value}` } : {}), ...(options.headers || {}) } }); const body = await response.json(); if (!response.ok) throw new Error(text(body.error || "Local request failed.")); return body; };
const pair = () => [baseline.value, candidate.value];
const update = () => { const locked = pending; [requirement, baseline, candidate, propose, reviewSubmit, approve, run, refreshReport, save, refreshSaved, prepare, saved, reviewerCode, unlock].forEach((control) => { control.disabled = locked || (control === run && (!receipt || !suite || receipt.digest !== suite.digest)) || (control === refreshReport && !activeRunId) || (control === save && !latestRun) || (control === reviewSubmit && !proposal) || (control === approve && !suite) || (control === prepare && !saved.value); }); };
const clear = (message) => { version += 1; proposal = undefined; suite = undefined; receipt = undefined; latestRun = undefined; activeRunId = undefined; review.hidden = true; approval.hidden = true; report.hidden = true; refreshReport.hidden = true; reviewOutput.replaceChildren(); decisions.replaceChildren(); approvalOutput.replaceChildren(); reportOutput.replaceChildren(); downloads.replaceChildren(); if (message) status.textContent = message; update(); };
const validPair = () => baseline.value !== candidate.value;
const releaseText = (release) => `${release.id}: ${release.documentPath} (${release.fingerprint})`;
function renderProposal(data) {
  proposal = data;
  const candidateProposal = data.proposal;
  reviewOutput.replaceChildren(
    panel("Planner", [node("p", provenanceLabel(data.provenance))]),
    panel("Original source and interpreted criteria", [node("p", candidateProposal.requirement.originalText), list(candidateProposal.requirement.criteria.map((item) => `${item.id}: ${item.sourceQuote} — ${item.normalizedRule}`))]),
    panel("Bounded cases and independently derived expectations", [list(candidateProposal.cases.map((item) => `${item.id}: ${item.rationale}; actions ${item.actions.map((action) => action.kind + ":" + action.target).join(", ")}; assertions ${item.assertions.map((assertion) => assertion.predicate).join(", ")}`))]),
    panel("Visible coverage gaps", [candidateProposal.gaps.length ? list(candidateProposal.gaps) : node("p", "No coverage gaps were returned for this finite fixture vocabulary.")]),
    panel("Registered inspection", [list(data.context.grounding.releases.map(releaseText)), node("p", `Observed common controls: ${data.context.grounding.observedTargets.join(", ") || "none"}.`), raw("Open exact prepared proposal", data)])
  );
  decisions.replaceChildren(...candidateProposal.requirement.criteria.map((criterion) => {
    const item = node("fieldset", undefined, "workbench-panel"); const interpretation = document.createElement("input"); interpretation.value = criterion.normalizedRule; interpretation.readOnly = true; interpretation.dataset.criterion = criterion.id;
    const accepted = document.createElement("input"); accepted.type = "checkbox"; accepted.dataset.accept = criterion.id;
    const scope = document.createElement("select"); scope.dataset.scope = criterion.id; scope.append(new Option("Select scope", ""), new Option("Unchanged", "unchanged"), new Option("New or changed", "new-or-changed"));
    const reference = document.createElement("input"); reference.type = "checkbox"; reference.dataset.reference = criterion.id; reference.value = "checkout-reference-v2";
    item.append(node("legend", `${criterion.id}: ${criterion.sourceQuote}`), node("label", undefined), interpretation, node("label", "Accept interpretation "), accepted, node("label", "Scope "), scope, node("label", "Adopt checkout reference "), reference);
    for (const change of candidateProposal.requirement.numericRuleChanges.filter((change) => change.criterionId === criterion.id)) { const numeric = document.createElement("input"); numeric.type = "checkbox"; numeric.dataset.numeric = criterion.id; numeric.value = JSON.stringify(change); item.append(node("label", `Accept ${change.field}: ${data.context.rules[change.field]} → ${change.value} `), numeric); }
    for (const gap of candidateProposal.gaps) { const gapCheck = document.createElement("input"); gapCheck.type = "checkbox"; gapCheck.dataset.gap = criterion.id; gapCheck.value = gap; item.append(node("label", `Accept gap: ${gap} `), gapCheck); }
    return item;
  }));
  review.hidden = false; $("#v2-review-heading").focus(); update();
}
function renderPrepared(data, label) {
  receipt = undefined; latestRun = undefined; downloads.replaceChildren(); report.hidden = true; suite = data;
  const readableCases = data.definition.cases.map((item, index) => panel(`${item.id}: ${item.category}`, [node("p", `${item.rationale}; criteria: ${item.criterionIds.join(", ")}`), list(item.actions.map((action) => `${action.id}: ${action.kind} ${action.target} = ${text(action.value)}`)), list(item.assertions.map((assertion) => `${assertion.id}: ${assertion.predicate}; expected ${text(data.expectations[index])}`))]));
  approvalOutput.replaceChildren(panel(label, [node("p", provenanceLabel(data.provenance)), node("p", `Digest: ${data.digest}`), node("p", `Rules: ${text(data.definition.rules)}`), node("p", `Reviewed criteria: ${data.definition.requirement.criteria.map((criterion) => `${criterion.id}: ${criterion.sourceQuote}`).join("; ")}`), node("p", `Scope: ${data.definition.requirement.expectationScope.map((item) => `${item.criterionId}=${item.scope}`).join(", ")}`), node("p", `Accepted gaps: ${data.definition.requirement.coverageGaps.join("; ") || "none"}`), list(data.definition.releases.map(releaseText)), ...readableCases, raw("Open exact unapproved snapshot", data)]));
  approval.hidden = false; $("#v2-approval-heading").focus(); update();
}
function renderRun(data) {
  activeRunId = data.id;
  latestRun = data;
  const recorded = panel("Recorded run snapshot", [node("p", provenanceLabel(data.artifact.provenance)), node("p", `Baseline ${data.artifact.definition.releases[0].id}; candidate ${data.artifact.definition.releases[1].id}.`), node("p", `Approval digest: ${data.approvalDigest}`), node("p", `Source: ${data.artifact.definition.requirement.originalText}`), node("p", "The proposal controls above select inputs for a new suite; this report describes the recorded snapshot.")]);
  const result = panel("Execution outcome", [node("p", `Suite ${data.verdict}; candidate ${data.candidateVerdict}.`), node("p", `Status: ${data.status}.`)]);
  const comparison = panel("Per-case comparison", [data.comparisons.length ? list(data.comparisons.map((item) => `${item.caseId}: ${item.classification}`)) : node("p", "Comparison is pending.")]);
  const coverage = panel("Coverage", [data.coverage.length ? list(data.coverage) : node("p", "No accepted coverage gaps recorded.")]);
  const observationList = node("ol");
  observationList.replaceChildren(...data.records.map((item) => { const entry = node("li", `${item.caseId} / ${item.releaseId}: ${item.verdict}`); const details = node("ul"); details.replaceChildren(...item.assertions.map((assertion) => { const observed = assertion.observed === null ? assertion.verdict === "INCONCLUSIVE" ? "Unavailable observation" : "Recorded none" : text(assertion.observed); const line = node("li", `${assertion.id} ${assertion.verdict}; expected ${text(assertion.expected)}; observed ${observed}; ${assertion.timestamp}; ${assertion.url}`); if (id.test(data.id) && /^[a-z0-9-]+\.png$/.test(assertion.screenshot) && assertion.screenshotSha256) { const link = node("a", "Open verified screenshot"); link.href = `/api/v2/runs/${data.id}/evidence/${assertion.screenshot}`; protectedDownload(link, assertion.screenshot); line.append(document.createTextNode(" "), link); } return line; })); entry.append(details); return entry; }));
  const observations = panel("Observed paired records", [observationList, raw("Open raw run data", data)]);
  reportOutput.replaceChildren(recorded, result, comparison, coverage, observations);
  downloads.replaceChildren();
  if (id.test(data.id)) {
    const reopen = node("a", "Open this report"); reopen.href = `/workbench.html?run=${data.id}`;
    const packet = node("a", "Download bug packet"); packet.href = `/api/v2/runs/${data.id}/bug-packet`; packet.download = "";
    const exportFile = node("a", "Download Playwright export"); exportFile.href = `/api/v2/runs/${data.id}/playwright.test.mjs`; exportFile.download = "";
    protectedDownload(packet, `proofpath-${data.id}.md`); protectedDownload(exportFile, `proofpath-${data.id}.test.mjs`); downloads.append(reopen, document.createTextNode(" · "), packet, document.createTextNode(" · "), exportFile);
  }
  report.hidden = false; $("#v2-report-heading").focus(); update();
  refreshReport.hidden = false;
}
async function poll(runId, runVersion) { const deadline = Date.now() + 195_000; activeRunId = runId; while (Date.now() < deadline) { const current = await request(`/api/v2/runs/${runId}`); if (runVersion !== version) return false; renderRun(current); if (current.status === "completed" || current.status === "interrupted") return true; await new Promise((resolve) => setTimeout(resolve, 250)); } if (runVersion === version) status.textContent = "The persisted run is still active; refresh this report later without proposing again."; return false; }
requirement.addEventListener("input", () => clear("Inputs changed. Propose and review a new snapshot."));
reviewerCode.addEventListener("input", () => clear("Access code changed. Open the protected workbench or request a new proposal."));
unlock.addEventListener("click", async () => {
  if (pending) return;
  if (!reviewerCode.value) return status.textContent = "Enter the local reviewer access code.";
  const current = version; pending = true; update();
  try {
    await loadSaved();
    const requested = new URLSearchParams(location.search).get("run");
    if (requested && id.test(requested)) {
      const data = await request(`/api/v2/runs/${requested}`);
      if (current !== version) return;
      renderRun(data); status.textContent = "Loaded persisted read-only run report.";
    } else if (current === version) status.textContent = `Protected workbench ready. A ${liveProviderLabel} proposal consumes a reserved attempt; saved reuse and reports do not.`;
  } catch (error) { if (current === version) status.textContent = error.message; }
  finally { pending = false; update(); }
});
baseline.addEventListener("change", () => clear("Release pair changed. Propose and review a new snapshot."));
candidate.addEventListener("change", () => clear("Release pair changed. Propose and review a new snapshot."));
saved.addEventListener("change", update);
propose.addEventListener("click", async () => { if (pending) return; if (!validPair()) return status.textContent = "Choose two different registered releases."; if (controlledLive && !reviewerCode.value) return status.textContent = `Enter the local reviewer access code before requesting a ${liveProviderLabel} proposal.`; const current = version; pending = true; update(); try { status.textContent = controlledLive ? `Inspecting the registered pair and checking ${liveProviderLabel} request admission before proposing…` : "Inspecting the registered pair and requesting the explicit fixture proposal…"; const data = await request("/api/v2/proposals", { method: "POST", body: JSON.stringify({ requirement: requirement.value, releases: pair() }) }); if (current !== version) return; if (data.kind === "clarification") { status.textContent = `${controlledLive ? liveProviderLabel : "Fixture"} clarification: ${data.gaps.join(" ")}`; return; } renderProposal(data); status.textContent = "Review the source, rules, cases and gaps before compiling."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
reviewSubmit.addEventListener("click", async () => { if (pending || !proposal) return; const reviewed = proposal.proposal.requirement.criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: decisions.querySelector(`[data-criterion="${criterion.id}"]`).value, scope: decisions.querySelector(`[data-scope="${criterion.id}"]`).value, adoptedReferenceIds: decisions.querySelector(`[data-reference="${criterion.id}"]`).checked ? ["checkout-reference-v2"] : [], acceptedGaps: [...decisions.querySelectorAll(`[data-gap="${criterion.id}"]:checked`)].map((input) => input.value), acceptedNumericRuleChanges: [...decisions.querySelectorAll(`[data-numeric="${criterion.id}"]:checked`)].map((input) => JSON.parse(input.value)) })); if (reviewed.some((item) => !decisions.querySelector(`[data-accept="${item.criterionId}"]`).checked || !item.scope) || [...decisions.querySelectorAll("[data-numeric]")].some((input) => !input.checked)) return status.textContent = "Accept every interpretation, rule change, and criterion scope."; const current = version; pending = true; update(); try { const data = await request(`/api/v2/proposals/${proposal.id}/review`, { method: "POST", body: JSON.stringify({ review: { decisions: reviewed } }) }); if (current !== version) return; renderPrepared(data, "Reviewed snapshot ready for final approval"); status.textContent = "No run is authorized until final one-use approval."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
approve.addEventListener("click", async () => { if (pending || !suite) return; const current = version; pending = true; update(); try { const next = await request(`/api/v2/suites/${suite.id}/approve`, { method: "POST", body: "{}" }); if (current !== version || next.digest !== suite.digest) return; receipt = next; approvalOutput.append(node("p", `One-use approval recorded for ${receipt.digest}.`)); status.textContent = "Approval recorded. Start the bounded paired run when ready."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
run.addEventListener("click", async () => { if (pending) return; if (!receipt || !suite || receipt.digest !== suite.digest) return status.textContent = "Approve the displayed reviewed snapshot before running."; const current = version; pending = true; update(); try { status.textContent = "Starting bounded paired run…"; const started = await request(`/api/v2/approvals/${receipt.id}/runs`, { method: "POST", body: "{}" }); receipt = undefined; if (await poll(started.runId, current) && current === version) status.textContent = "Paired run completed; save the immutable definition or download artifacts."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
refreshReport.addEventListener("click", async () => { if (pending || !activeRunId) return; const current = version; pending = true; update(); try { const data = await request(`/api/v2/runs/${activeRunId}`); if (current !== version) return; renderRun(data); status.textContent = "Refreshed persisted read-only run report."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
save.addEventListener("click", async () => { if (pending || !latestRun || !id.test(latestRun.id)) return; pending = true; update(); try { const result = await request(`/api/v2/runs/${latestRun.id}/regressions`, { method: "POST", body: "{}" }); await loadSaved(); status.textContent = `Saved immutable regression ${result.id}.`; } catch (error) { status.textContent = error.message; } finally { pending = false; update(); } });
async function loadSaved() { const entries = await request("/api/v2/regressions"); saved.replaceChildren(node("option", "No saved definition selected")); saved.options[0].value = ""; for (const entry of entries) { const option = node("option", `${entry.id}: ${entry.definition.requirement.originalText.slice(0, 72)}`); option.value = entry.id; saved.append(option); } update(); }
refreshSaved.addEventListener("click", async () => { if (pending) return; pending = true; update(); try { await loadSaved(); status.textContent = "Saved definitions refreshed without invoking the planner."; } catch (error) { status.textContent = error.message; } finally { pending = false; update(); } });
prepare.addEventListener("click", async () => { if (pending) return; if (!saved.value || !validPair()) return status.textContent = "Select a saved definition and two different registered releases."; receipt = undefined; update(); const current = version; pending = true; update(); try { const data = await request(`/api/v2/regressions/${saved.value}/prepare`, { method: "POST", body: JSON.stringify({ releases: pair() }) }); if (current !== version) return; renderPrepared(data, "Saved immutable definition rebound to the selected pair"); status.textContent = "Saved reuse made zero planner calls. A fresh final approval is required."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !propose.disabled) { event.preventDefault(); propose.click(); } });
(async () => {
  try {
    const config = await request("/api/v2/config");
    controlledLive = config.authenticationRequired === true || config.mode === "controlled-live" || config.mode === "controlled-meta";
    liveProviderLabel = config.planner?.provider === "baseten" ? "Baseten-hosted Meta" : "Meta Model API";
    reviewerCodeLabel.hidden = !controlledLive; controlledNote.hidden = !controlledLive; unlock.hidden = !controlledLive;
    if (controlledLive) {
      modeLabel.textContent = `Version 2 workbench · ${liveProviderLabel} · Reviewer access required`;
      controlledNote.textContent = `Up to 3 proposals per access code, 50 total across providers; US$0.05 reserved per proposal, US$2.50 total. ${config.planner?.schemaEnforcement === "local" ? "ProofPath validates model output locally before review. " : ""}The access code remains only in this page’s memory.`;
    }
    if (!controlledLive) await loadSaved();
    const requested = new URLSearchParams(location.search).get("run");
    if (!controlledLive && requested && id.test(requested)) {
      activeRunId = requested; renderRun(await request(`/api/v2/runs/${requested}`));
      status.textContent = "Loaded persisted read-only run report.";
    } else status.textContent = controlledLive ? `${liveProviderLabel} is configured locally. Enter the reviewer code to access the protected workbench.` : "Fixture-only workbench ready; live model use is disabled.";
  } catch { status.textContent = "Saved definitions are unavailable until the local runtime is ready."; }
})();
