const prices = { "desk-lamp": 4000, notebook: 3500, cable: 499 };
const names = { "desk-lamp": "Desk Lamp", notebook: "Notebook", cable: "Cable" };

export function createCheckout({ release, deliveryUsesSubtotal }) {
  const cart = new Map();
  const byId = (id) => document.querySelector(`#${id}`);
  const render = () => {
    const subtotal = [...cart].reduce((sum, [sku, quantity]) => sum + prices[sku] * quantity, 0);
    const appliedCoupon = byId("coupon").dataset.appliedCoupon ?? "";
    const discount = appliedCoupon === "SAVE10" ? Math.floor((subtotal * 1000 + 5000) / 10000) : 0;
    const discounted = subtotal - discount;
    const delivery = (deliveryUsesSubtotal ? subtotal : discounted) >= 7500 ? 0 : 500;
    const lines = byId("cart-lines");
    lines.replaceChildren();
    if (!cart.size) lines.textContent = "Cart is empty.";
    for (const [sku, quantity] of cart) {
      const line = document.createElement("p");
      const label = document.createElement("label");
      label.htmlFor = `quantity-${sku}`;
      label.textContent = `${names[sku]} quantity`;
      const input = document.createElement("input");
      input.id = label.htmlFor;
      input.type = "number";
      input.min = "1";
      input.max = "5";
      input.value = String(quantity);
      input.addEventListener("change", () => {
        const next = Number(input.value);
        if (Number.isInteger(next) && next >= 1 && next <= 5) cart.set(sku, next);
        render();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.id = `remove-${sku}`;
      remove.textContent = `Remove ${names[sku]}`;
      remove.addEventListener("click", () => { cart.delete(sku); render(); });
      line.append(label, input, remove);
      lines.append(line);
    }
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
  byId("apply-coupon").addEventListener("click", () => {
    const coupon = byId("coupon").value;
    byId("coupon").dataset.appliedCoupon = coupon;
    byId("coupon-error").hidden = !coupon || coupon === "SAVE10";
    render();
  });
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
}
