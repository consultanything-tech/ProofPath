const $ = (selector) => document.querySelector(selector);
const status = $("#v2-status");
const requirement = $("#v2-requirement");
const baseline = $("#v2-baseline");
const candidate = $("#v2-candidate");
const propose = $("#v2-propose");
const review = $("#v2-review");
const reviewOutput = $("#v2-review-output");
const acceptGaps = $("#v2-accept-gaps");
const reviewSubmit = $("#v2-review-submit");
const approval = $("#v2-approval");
const approvalOutput = $("#v2-approval-output");
const approve = $("#v2-approve");
const run = $("#v2-run");
const report = $("#v2-report");
const reportOutput = $("#v2-report-output");
const save = $("#v2-save");
const downloads = $("#v2-downloads");
const saved = $("#v2-saved");
const refreshSaved = $("#v2-refresh-saved");
const prepare = $("#v2-prepare");
let version = 0;
let pending = false;
let proposal;
let suite;
let receipt;
let latestRun;
const id = /^[a-f0-9-]{36}$/;
const text = (value) => value === null || value === undefined ? "Not recorded" : String(value);
const node = (tag, value, className) => { const item = document.createElement(tag); if (className) item.className = className; if (value !== undefined) item.textContent = value; return item; };
const list = (items) => { const element = node("ol"); element.replaceChildren(...items.map((item) => node("li", item))); return element; };
const panel = (title, children) => { const element = node("section", undefined, "workbench-panel"); element.append(node("h3", title), ...children); return element; };
const raw = (title, value) => { const details = node("details", undefined, "raw-details"); details.append(node("summary", title), node("pre", JSON.stringify(value, null, 2))); return details; };
const request = async (path, options = {}) => { const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } }); const body = await response.json(); if (!response.ok) throw new Error(text(body.error || "Local request failed.")); return body; };
const pair = () => [baseline.value, candidate.value];
const update = () => { const locked = pending; [requirement, baseline, candidate, propose, reviewSubmit, approve, run, save, refreshSaved, prepare, saved].forEach((control) => { control.disabled = locked || (control === run && !receipt) || (control === save && !latestRun) || (control === reviewSubmit && !proposal) || (control === approve && !suite) || (control === prepare && !saved.value); }); };
const clear = (message) => { version += 1; proposal = undefined; suite = undefined; receipt = undefined; latestRun = undefined; review.hidden = true; approval.hidden = true; report.hidden = true; reviewOutput.replaceChildren(); approvalOutput.replaceChildren(); reportOutput.replaceChildren(); downloads.replaceChildren(); acceptGaps.checked = false; if (message) status.textContent = message; update(); };
const validPair = () => baseline.value !== candidate.value;
const releaseText = (release) => `${release.id}: ${release.documentPath} (${release.fingerprint})`;
function renderProposal(data) {
  proposal = data;
  const candidateProposal = data.proposal;
  reviewOutput.replaceChildren(
    panel("Original source and interpreted criteria", [node("p", candidateProposal.requirement.originalText), list(candidateProposal.requirement.criteria.map((item) => `${item.id}: ${item.sourceQuote} — ${item.normalizedRule}`))]),
    panel("Bounded cases and independently derived expectations", [list(candidateProposal.cases.map((item) => `${item.id}: ${item.rationale}; actions ${item.actions.map((action) => action.kind + ":" + action.target).join(", ")}; assertions ${item.assertions.map((assertion) => assertion.predicate).join(", ")}`))]),
    panel("Visible coverage gaps", [candidateProposal.gaps.length ? list(candidateProposal.gaps) : node("p", "No coverage gaps were returned for this finite fixture vocabulary.")]),
    panel("Registered inspection", [list(data.context.grounding.releases.map(releaseText)), node("p", `Observed common controls: ${data.context.grounding.observedTargets.join(", ") || "none"}.`), raw("Open exact prepared proposal", data)])
  );
  review.hidden = false; $("#v2-review-heading").focus(); update();
}
function renderPrepared(data, label) {
  suite = data;
  approvalOutput.replaceChildren(panel(label, [node("p", `Digest: ${data.digest}`), node("p", `Cases: ${data.definition.cases.map((item) => item.id).join(", ")}.`), node("p", `Pair: ${data.definition.releases.map((item) => item.id).join(" → ")}.`), raw("Open exact unapproved snapshot", data)]));
  approval.hidden = false; $("#v2-approval-heading").focus(); update();
}
function renderRun(data) {
  latestRun = data;
  const result = panel("Execution outcome", [node("p", `Suite ${data.verdict}; candidate ${data.candidateVerdict}.`), node("p", `Status: ${data.status}.`)]);
  const comparison = panel("Per-case comparison", [data.comparisons.length ? list(data.comparisons.map((item) => `${item.caseId}: ${item.classification}`)) : node("p", "Comparison is pending.")]);
  const coverage = panel("Coverage", [data.coverage.length ? list(data.coverage) : node("p", "No accepted coverage gaps recorded.")]);
  const observations = panel("Observed paired records", [list(data.records.map((item) => `${item.caseId} / ${item.releaseId}: ${item.verdict}; ${item.assertions.map((assertion) => `${assertion.id} expected ${text(assertion.expected)}, observed ${text(assertion.observed)}, screenshot ${assertion.screenshotSha256 || assertion.screenshot}`).join("; ")}`)), raw("Open raw run data", data)]);
  reportOutput.replaceChildren(result, comparison, coverage, observations);
  downloads.replaceChildren();
  if (id.test(data.id)) {
    const packet = node("a", "Download bug packet"); packet.href = `/api/v2/runs/${data.id}/bug-packet`; packet.download = "";
    const exportFile = node("a", "Download Playwright export"); exportFile.href = `/api/v2/runs/${data.id}/playwright.test.mjs`; exportFile.download = "";
    downloads.append(packet, document.createTextNode(" · "), exportFile);
  }
  report.hidden = false; $("#v2-report-heading").focus(); update();
}
async function poll(runId, runVersion) { for (let attempts = 0; attempts < 100; attempts += 1) { const current = await request(`/api/v2/runs/${runId}`); if (runVersion !== version) return; renderRun(current); if (current.status === "completed" || current.status === "interrupted") return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error("Timed out waiting for the bounded local run report."); }
requirement.addEventListener("input", () => clear("Inputs changed. Propose and review a new snapshot."));
baseline.addEventListener("change", () => clear("Release pair changed. Propose and review a new snapshot."));
candidate.addEventListener("change", () => clear("Release pair changed. Propose and review a new snapshot."));
saved.addEventListener("change", update);
propose.addEventListener("click", async () => { if (!validPair()) return status.textContent = "Choose two different registered releases."; const current = version; pending = true; update(); try { status.textContent = "Inspecting the registered pair and requesting the explicit fixture proposal…"; const data = await request("/api/v2/proposals", { method: "POST", body: JSON.stringify({ requirement: requirement.value, releases: pair() }) }); if (current !== version) return; if (data.kind === "clarification") { status.textContent = `Fixture clarification: ${data.gaps.join(" ")}`; return; } renderProposal(data); status.textContent = "Review the source, rules, cases and gaps before compiling."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
reviewSubmit.addEventListener("click", async () => { if (!proposal || (proposal.proposal.gaps.length && !acceptGaps.checked)) return status.textContent = "Accept the visible coverage gaps before compiling the reviewed snapshot."; const current = version; pending = true; update(); try { const decisions = proposal.proposal.requirement.criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged", adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: proposal.proposal.gaps, acceptedNumericRuleChanges: [] })); const data = await request(`/api/v2/proposals/${proposal.id}/review`, { method: "POST", body: JSON.stringify({ review: { decisions } }) }); if (current !== version) return; renderPrepared(data, "Reviewed snapshot ready for final approval"); status.textContent = "No run is authorized until final one-use approval."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
approve.addEventListener("click", async () => { if (!suite) return; const current = version; pending = true; update(); try { receipt = await request(`/api/v2/suites/${suite.id}/approve`, { method: "POST", body: "{}" }); if (current !== version) return; approvalOutput.append(node("p", `One-use approval recorded for ${receipt.digest}.`)); status.textContent = "Approval recorded. Start the bounded paired run when ready."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
run.addEventListener("click", async () => { if (!receipt) return; const current = version; pending = true; update(); try { status.textContent = "Starting bounded paired run…"; const started = await request(`/api/v2/approvals/${receipt.id}/runs`, { method: "POST", body: "{}" }); receipt = undefined; await poll(started.runId, current); if (current === version) status.textContent = "Paired run completed; save the immutable definition or download artifacts."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
save.addEventListener("click", async () => { if (!latestRun || !id.test(latestRun.id)) return; pending = true; update(); try { const result = await request(`/api/v2/runs/${latestRun.id}/regressions`, { method: "POST", body: "{}" }); await loadSaved(); status.textContent = `Saved immutable regression ${result.id}.`; } catch (error) { status.textContent = error.message; } finally { pending = false; update(); } });
async function loadSaved() { const entries = await request("/api/v2/regressions"); saved.replaceChildren(node("option", "No saved definition selected")); saved.options[0].value = ""; for (const entry of entries) { const option = node("option", `${entry.id}: ${entry.definition.requirement.originalText.slice(0, 72)}`); option.value = entry.id; saved.append(option); } update(); }
refreshSaved.addEventListener("click", async () => { pending = true; update(); try { await loadSaved(); status.textContent = "Saved definitions refreshed without invoking the planner."; } catch (error) { status.textContent = error.message; } finally { pending = false; update(); } });
prepare.addEventListener("click", async () => { if (!saved.value || !validPair()) return status.textContent = "Select a saved definition and two different registered releases."; const current = version; pending = true; update(); try { const data = await request(`/api/v2/regressions/${saved.value}/prepare`, { method: "POST", body: JSON.stringify({ releases: pair() }) }); if (current !== version) return; renderPrepared(data, "Saved immutable definition rebound to the selected pair"); status.textContent = "Saved reuse made zero planner calls. A fresh final approval is required."; } catch (error) { if (current === version) status.textContent = error.message; } finally { pending = false; update(); } });
document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !propose.disabled) { event.preventDefault(); propose.click(); } });
(async () => { try { await loadSaved(); status.textContent = "Fixture-only workbench ready; live model use is disabled."; } catch { status.textContent = "Saved definitions are unavailable until the local runtime is ready."; } })();
