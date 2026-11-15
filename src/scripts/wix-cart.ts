// Issa Green cart drawer — the design's drawer (public/cart.css markup/behaviour) driven by the
// Wix cart (src/wix/storefront/cart-store.ts, Cart V2 + hosted checkout), not localStorage.
// Exposes window.IssaCart for pdp.js / the product cards / the order-confirmation page.
import {
  addLine,
  clearBusy,
  getCartState,
  goToCheckout,
  refreshCart,
  removeCartLine,
  setCartOpen,
  subscribeCart,
  updateLineQuantity,
} from "../wix/storefront/cart-store";
import type { CartLine } from "../wix/storefront/types";

type Item = { id?: string; productId?: string; variantId?: string };
const MAX_QTY = 10;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

let lastFocus: HTMLElement | null = null;
let checkoutState: "idle" | "redirecting" | "failed" = "idle";
let lineError: Record<string, string> = {};
let addError = "";

const overlay = document.createElement("div");
overlay.className = "cart-overlay";
const drawer = document.createElement("aside");
drawer.className = "cart-drawer";
drawer.setAttribute("role", "dialog");
drawer.setAttribute("aria-modal", "true");
drawer.setAttribute("aria-labelledby", "cart-title");
drawer.innerHTML =
  '<div class="cart-head"><h2 id="cart-title">Your cart <small data-cart-n></small></h2>' +
  '<button class="cart-close" type="button" aria-label="Close cart"><svg viewBox="0 0 24 24"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg></button></div>' +
  '<div class="cart-body" data-cart-body></div><div class="cart-foot" data-cart-foot></div>' +
  '<div class="cart-sr" role="status" aria-live="polite" data-cart-live></div>';

function live(msg: string) {
  const el = drawer.querySelector("[data-cart-live]") as HTMLElement;
  el.textContent = "";
  setTimeout(() => (el.textContent = msg), 30);
}

const available = (l: CartLine) => l.status === "IN_STOCK" || l.status === "PARTIALLY_IN_STOCK";

function lineHTML(l: CartLine): string {
  const un = !available(l);
  const max = Math.min(MAX_QTY, l.availableQuantity ?? MAX_QTY);
  const atMax = l.quantity >= max;
  const variant = (l.descriptionLines || []).join(", ");
  const unit = l.compareAtLinePrice
    ? `<s>${esc(l.compareAtLinePrice)}</s><span class="cart-sr">Regular price. Now </span>${esc(l.linePrice)}`
    : esc(l.quantity > 1 ? l.unitPrice : l.linePrice);
  const err = lineError[l.lineItemId];
  const msg = un
    ? '<p class="cl-msg error" role="alert">This item is no longer available. Please remove it to continue.</p>'
    : (atMax ? `<p class="cl-msg">Maximum ${max} per order.</p>` : "") + (err ? `<p class="cl-msg error" role="alert">${esc(err)}</p>` : "");
  const img = l.imageUrl ? `<img src="${esc(l.imageUrl)}" alt="">` : "";
  return (
    `<li class="cart-line${un ? " unavailable" : ""}" data-id="${esc(l.lineItemId)}">` +
    `<div class="cl-img">${img}</div><div class="cl-main">` +
    `<div class="cl-top"><div><p class="cl-name">${esc(l.productName)}</p>${variant ? `<p class="cl-opts">${esc(variant)}</p>` : ""}` +
    `<p class="cl-unit">${unit}</p></div>` +
    `<button class="cl-remove" type="button" data-remove aria-label="Remove ${esc(l.productName + (variant ? ", " + variant : ""))}">Remove</button></div>` +
    (un
      ? ""
      : `<div class="cl-bottom"><div class="qty" role="group" aria-label="Quantity">` +
        `<button type="button" data-dec aria-label="Decrease quantity"${l.quantity <= 1 ? " disabled" : ""}>−</button><output aria-live="polite">${l.quantity}</output>` +
        `<button type="button" data-inc aria-label="Increase quantity"${atMax ? " disabled" : ""}>+</button></div>` +
        `<span class="cl-total">${esc(l.linePrice)}</span></div>`) +
    msg +
    `</div></li>`
  );
}

function render() {
  const st = getCartState();
  const cart = st.cart;
  const lines = cart?.lines ?? [];
  const body = drawer.querySelector("[data-cart-body]") as HTMLElement;
  const foot = drawer.querySelector("[data-cart-foot]") as HTMLElement;
  const n = cart?.itemCount ?? 0;
  (drawer.querySelector("[data-cart-n]") as HTMLElement).textContent = n ? `(${n}${n === 1 ? " item)" : " items)"}` : "";
  renderBadge(n);
  if (!lines.length) {
    body.innerHTML =
      '<div class="cart-empty"><h3>Your cart is empty</h3><p>Find something to sip — tea straight from Japanese farmers, and tea ware to prepare it.</p>' +
      '<a class="cart-btn" href="/shop-tea">Shop tea</a><a class="cart-btn secondary" href="/tea-ware">Shop tea ware</a></div>' +
      (addError ? `<p class="cart-checkout-err" role="alert">${esc(addError)}</p>` : "");
    foot.hidden = true;
    return;
  }
  foot.hidden = false;
  body.innerHTML =
    (addError ? `<p class="cart-checkout-err" role="alert">${esc(addError)}</p>` : "") +
    '<ul class="cart-lines">' + lines.map(lineHTML).join("") + "</ul>";
  const blocked = lines.some((l) => !available(l));
  const busy = st.busy;
  const summary =
    (cart!.discount ? `<div class="cart-row discount"><span>Discount</span><strong>−${esc(cart!.discount)}</strong></div>` : "") +
    `<div class="cart-row subtotal"><span>Subtotal</span><strong>${esc(cart!.subtotal)} ${esc(cart!.currency || "")}</strong></div>`;
  const btnLabel = checkoutState === "redirecting" ? "Redirecting to checkout…" : "Continue to secure checkout";
  foot.innerHTML =
    summary +
    '<p class="cart-note">Shipping and taxes calculated at checkout.</p>' +
    `<button class="cart-btn" type="button" data-checkout${busy || blocked || checkoutState === "redirecting" ? " disabled" : ""}${checkoutState === "redirecting" ? ' aria-busy="true"' : ""}>${btnLabel}</button>` +
    '<button class="cart-btn secondary" type="button" data-continue>Continue shopping</button>' +
    (checkoutState === "failed"
      ? `<p class="cart-checkout-err" role="alert">${esc(st.error || "We couldn't open checkout.")} Your cart is saved. <button type="button" data-checkout>Try again</button></p>`
      : "");
}

let toggles: HTMLElement[] = [];
function findToggles() {
  document
    .querySelectorAll<HTMLElement>('.header-actions button[aria-label^="Cart"], .header-actions a[href="/cart"]')
    .forEach((el) => {
      if (toggles.includes(el)) return;
      toggles.push(el);
      el.setAttribute("aria-haspopup", "dialog");
      el.addEventListener("click", (e) => {
        e.preventDefault();
        open(el);
      });
    });
}
function renderBadge(n: number) {
  const label = n > 99 ? "99+" : String(n);
  toggles.forEach((el) => {
    const span = el.querySelector("span");
    if (span) {
      span.classList.add("cart-count");
      span.textContent = label;
      span.hidden = n === 0;
    }
    el.setAttribute("aria-label", `Cart (${n}${n === 1 ? " item)" : " items)"}`);
  });
}

function open(from?: HTMLElement | null) {
  lastFocus = from || (document.activeElement as HTMLElement);
  checkoutState = "idle";
  render();
  overlay.classList.add("open");
  drawer.classList.add("open");
  document.body.classList.add("cart-open");
  setTimeout(() => (drawer.querySelector(".cart-close") as HTMLElement)?.focus(), 50);
}
function close() {
  overlay.classList.remove("open");
  drawer.classList.remove("open");
  document.body.classList.remove("cart-open");
  setCartOpen(false);
  lastFocus?.focus?.();
}

async function add(d: Item, qty = 1, from?: HTMLElement | null) {
  const ids = d.productId && d.variantId ? { productId: d.productId, variantId: d.variantId } : null;
  addError = "";
  if (!ids) {
    addError = "This item can't be added to the cart right now.";
    open(from);
    throw new Error(addError);
  }
  const existing = (getCartState().cart?.lines ?? []).length;
  void existing;
  try {
    await addLine(ids.productId, ids.variantId, Math.max(1, Math.min(MAX_QTY, qty)));
  } catch (e) {
    addError = e instanceof Error ? e.message : String(e);
    open(from);
    throw e;
  }
  open(from);
}

async function startCheckout() {
  checkoutState = "redirecting";
  render();
  try {
    await goToCheckout();
  } catch {
    checkoutState = "failed";
    render();
  }
}

drawer.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest(".cart-close") || t.closest("[data-continue]")) return close();
  if (t.closest("[data-checkout]")) return void startCheckout();
  const li = t.closest(".cart-line") as HTMLElement | null;
  if (!li) return;
  const id = li.getAttribute("data-id")!;
  const l = (getCartState().cart?.lines ?? []).find((x) => x.lineItemId === id);
  if (!l) return;
  li.classList.add("updating");
  delete lineError[id];
  try {
    if (t.closest("[data-remove]")) {
      await removeCartLine(id);
      live(`${l.productName} removed`);
    } else if (t.closest("[data-inc]") && l.quantity < MAX_QTY) {
      await updateLineQuantity(id, l.quantity + 1);
      live(`Quantity ${l.quantity + 1}`);
    } else if (t.closest("[data-dec]") && l.quantity > 1) {
      await updateLineQuantity(id, l.quantity - 1);
      live(`Quantity ${l.quantity - 1}`);
    }
  } catch (err) {
    lineError[id] = err instanceof Error ? err.message : String(err);
    render();
  }
});
overlay.addEventListener("click", close);
document.addEventListener("keydown", (e) => {
  if (!drawer.classList.contains("open")) return;
  if (e.key === "Escape") return close();
  if (e.key === "Tab") {
    const f = drawer.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Add-to-cart buttons on product cards (shop pages)
document.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button.add-btn") as HTMLButtonElement | null;
  if (!btn || btn.disabled || btn.classList.contains("is-loading")) return;
  const card = btn.closest(".product-card") as HTMLElement | null;
  if (!card || !card.dataset.productId || !card.dataset.variantId) return;
  const label = btn.textContent;
  btn.classList.add("is-loading");
  btn.setAttribute("aria-busy", "true");
  btn.textContent = "Adding…";
  add({ productId: card.dataset.productId, variantId: card.dataset.variantId }, 1, btn)
    .then(() => {
      btn.classList.add("is-added");
      btn.textContent = "Added ✓";
    })
    .catch(() => {
      btn.textContent = label;
    })
    .finally(() => {
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      setTimeout(() => {
        btn.classList.remove("is-added");
        btn.textContent = label;
      }, 1400);
    });
});

document.body.appendChild(overlay);
document.body.appendChild(drawer);
findToggles();
subscribeCart(() => {
  render();
  if (getCartState().open && !drawer.classList.contains("open")) open();
});
render();

(window as any).IssaCart = {
  add,
  max: MAX_QTY,
  open,
  close,
  count: () => getCartState().cart?.itemCount ?? 0,
  // Wix empties the cart itself once an order is placed; just re-read it.
  clear: () => refreshCart(),
};
// Back from the Wix-hosted checkout: the browser restores this page from its back/forward cache with
// the "Redirecting…" state frozen in. Reset it and re-read the cart (the buyer may have changed it).
function resetAfterCheckout() {
  if (checkoutState === "idle" && !getCartState().busy) return;
  checkoutState = "idle";
  clearBusy();
  void refreshCart().then(render);
  render();
}
window.addEventListener("pageshow", (e) => {
  if ((e as PageTransitionEvent).persisted || checkoutState !== "idle") resetAfterCheckout();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resetAfterCheckout();
});
if (new URLSearchParams(location.search).get("cart") === "open") open();
