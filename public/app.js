const status = document.querySelector("#status");
const review = document.querySelector("#review");
const run = document.querySelector("#run");
const report = document.querySelector("#report");
let planId;
let inputVersion = 0;
const scenario = document.querySelector("#scenario");
const revision = document.querySelector("#revision");
const requirement = document.querySelector("#requirement");
const invalidatePlan = () => {
  inputVersion += 1;
  planId = undefined;
  review.hidden = true;
  run.hidden = true;
  report.hidden = true;
  status.textContent = "Inputs changed. Propose and approve a new plan.";
};
const syncJourney = () => {
  const quantity = scenario.value === "quantity-update";
  revision.disabled = !quantity;
  if (scenario.value === "add-to-cart") { revision.value = "baseline"; requirement.value = "Add one Desk Lamp; cart quantity is 1 and total is S$39."; }
  if (quantity && revision.value === "baseline") revision.value = "seeded-bug";
  if (quantity) requirement.value = "Change Desk Lamp quantity to 2; total is S$78.";
  if (scenario.value === "required-fields") { revision.value = "baseline"; requirement.value = "Continue checkout with required fields blank; show both validation errors and stay on checkout."; }
};
scenario.addEventListener("change", () => { syncJourney(); invalidatePlan(); });
revision.addEventListener("change", invalidatePlan);
requirement.addEventListener("input", invalidatePlan);
syncJourney();
const request = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
};
document.querySelector("#plan").addEventListener("click", async () => {
  invalidatePlan();
  const version = inputVersion;
  try { status.textContent = "Planning…"; const data = await request("/api/plans", { method: "POST", body: JSON.stringify({ requirement: requirement.value, scenarioId: scenario.value, revision: revision.value }) }); if (version !== inputVersion) return; planId = data.id; document.querySelector("#plan-output").textContent = JSON.stringify({ approvalEnvelope: data.envelope, approvalDigest: data.digest }, null, 2); review.hidden = false; status.textContent = data.planner; } catch (error) { if (version === inputVersion) status.textContent = error.message; }
});
document.querySelector("#approve").addEventListener("click", async () => {
  const version = inputVersion;
  try { const data = await request(`/api/plans/${planId}/approve`, { method: "POST", body: "{}" }); if (version !== inputVersion) return; document.querySelector("#approval").textContent = `Approved ${data.digest}; expires ${new Date(data.expiresAt).toLocaleTimeString()}.`; run.hidden = false; status.textContent = "Approval recorded. One run is authorized."; } catch (error) { if (version === inputVersion) status.textContent = error.message; }
});
document.querySelector("#execute").addEventListener("click", async () => {
  const version = inputVersion;
  try { status.textContent = "Running approved plan…"; const data = await request(`/api/plans/${planId}/run`, { method: "POST", body: "{}" }); if (version !== inputVersion) return; run.hidden = true; const items = [Object.assign(document.createElement("p"), { textContent: `Overall verdict: ${data.verdict}` }), Object.assign(document.createElement("p"), { textContent: `Execution: ${data.executionStatus}` }), Object.assign(document.createElement("p"), { textContent: `Replay: ${data.replay.join(" → ")}` })]; const manifest = document.createElement("a"); manifest.href = `/runs/${data.runId}/manifest.json`; manifest.textContent = "Open run manifest"; items.push(manifest); if (data.executionError) items.push(Object.assign(document.createElement("p"), { textContent: `Execution detail: ${data.executionError}` })); items.push(...data.assertions.map(item => { const row = document.createElement("p"); row.textContent = `${item.id}: ${item.verdict} (expected ${item.expected}, observed ${item.observed ?? "missing"})${item.timestamp && item.url ? ` — ${item.url} at ${item.timestamp}` : ""}`; if (item.screenshot !== "not-captured.png") { const image = document.createElement("img"); image.src = `/evidence/${data.runId}/${item.screenshot}`; image.alt = `Evidence for ${item.id}`; row.append(" ", image); } return row; })); document.querySelector("#report-output").replaceChildren(...items); report.hidden = false; status.textContent = `Run ${data.executionStatus}.`; } catch (error) { if (version === inputVersion) status.textContent = error.message; }
});
