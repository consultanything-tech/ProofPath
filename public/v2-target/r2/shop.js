const release = "r2";
const defectiveDelivery = true;
const prices = { "desk-lamp": 4000, notebook: 3500, cable: 499 };
const names = { "desk-lamp": "Desk Lamp", notebook: "Notebook", cable: "Cable" };
const cart = new Map();
const byId = (id) => document.querySelector(`#${id}`);
const render = () => {
  const subtotal = [...cart].reduce((sum, [sku, quantity]) => sum + prices[sku] * quantity, 0);
  const validCoupon = byId("coupon").value === "SAVE10";
  const discount = validCoupon ? Math.floor((subtotal * 1000 + 5000) / 10000) : 0;
  const discounted = subtotal - discount;
  const delivery = (defectiveDelivery ? subtotal : discounted) >= 7500 ? 0 : 500;
  byId("cart-lines").textContent = cart.size ? [...cart].map(([sku, quantity]) => `${names[sku]} × ${quantity}`).join(", ") : "Cart is empty.";
  byId("subtotal-minor").textContent = String(subtotal);
  byId("discount-minor").textContent = String(discount);
  byId("delivery-minor").textContent = String(delivery);
  byId("total-minor").textContent = String(discounted + delivery);
};
document.querySelectorAll("[data-sku]").forEach((button) => button.addEventListener("click", () => {
  const sku = button.dataset.sku;
  const quantity = (cart.get(sku) ?? 0) + 1;
  if (quantity <= 5) cart.set(sku, quantity);
  render();
}));
byId("apply-coupon").addEventListener("click", () => { byId("coupon-error").hidden = !byId("coupon").value || byId("coupon").value === "SAVE10"; render(); });
byId("checkout").addEventListener("click", () => { byId("contact").hidden = false; byId("confirmation").hidden = true; });
byId("confirm").addEventListener("click", () => {
  const emailBlank = !byId("email").value.trim();
  const postalBlank = !byId("postal-code").value.trim();
  byId("email-error").hidden = !emailBlank;
  byId("postal-code-error").hidden = !postalBlank;
  if (!emailBlank && !postalBlank) { byId("contact").hidden = true; byId("confirmation").hidden = false; }
});
document.querySelector("main").dataset.release = release;
render();
