const quantity = document.querySelector("#quantity");
const revision = new URLSearchParams(window.location.search).get("revision");
const mode = revision === "seeded-bug" || revision === "fixed" ? revision : "baseline";
document.querySelector("#fixture-revision").textContent = mode;
const render = () => { const value = Math.max(0, Number.parseInt(quantity.value, 10) || 0); const cents = mode === "seeded-bug" && value === 2 ? 3900 : value * 3900; document.querySelector("#cart-quantity").textContent = String(value); document.querySelector("#cart-total-minor").textContent = String(cents); document.querySelector("#cart-total").textContent = `S$${(cents / 100).toFixed(2)}`; };
document.querySelector("#add").addEventListener("click", () => { quantity.value = "1"; render(); });
quantity.addEventListener("input", render);
