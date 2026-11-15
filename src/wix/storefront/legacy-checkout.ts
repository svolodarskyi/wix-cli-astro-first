// TEST ONLY — opt-in with ?checkout=legacy (turn off with ?checkout=v2).
// Builds the hosted checkout from Checkout V1 (the older checkout type the Wix editor site uses)
// instead of the Cart V2 id, so Google/Apple Pay "express checkout" can be compared between the two.
// Checkout V1 / Cart V1 are scheduled for removal on 2027-02-01 — do not ship this as the default.
// docs: https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/purchase-flow/checkout/checkout/create-checkout
import { checkout as checkoutV1, currentCartV2 } from "@wix/ecom";
import { redirects as redirectsModule } from "@wix/redirects";
import { wixModule } from "../sdk";
import type { Raw } from "./catalog-core";

const cartApi = wixModule(currentCartV2);
const checkoutApi = wixModule(checkoutV1);
const redirects = wixModule(redirectsModule);

const KEY = "issa-checkout-mode";

/** true when the visitor opted into the legacy checkout (?checkout=legacy), remembered for the tab. */
export function legacyCheckoutOn(): boolean {
  try {
    const p = new URLSearchParams(location.search).get("checkout");
    if (p === "legacy") sessionStorage.setItem(KEY, "legacy");
    if (p === "v2") sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === "legacy";
  } catch {
    return false;
  }
}

export async function legacyCheckoutUrl(): Promise<string> {
  const { cart } = await cartApi.getCurrentCart();
  const lines = ((cart as Raw)?.lineItems ?? []) as Raw[];
  if (!lines.length) throw new Error("Your cart is empty.");
  const lineItems = lines.map((l) => ({
    quantity: l.quantityInfo?.confirmedQuantity ?? l.quantityInfo?.requestedQuantity ?? 1,
    catalogReference: l.source?.catalogReference ?? l.catalogReference,
  }));
  const co: Raw = await checkoutApi.createCheckout({ channelType: "WEB", lineItems } as any);
  const checkoutId = co?._id ?? co?.id ?? co?.checkout?._id ?? co?.checkout?.id;
  if (!checkoutId) throw new Error("Checkout couldn't start (legacy).");
  const origin = window.location.origin;
  const session = await redirects.createRedirectSession({
    ecomCheckout: { checkoutId },
    callbacks: { postFlowUrl: `${origin}/shop-tea`, cartPageUrl: `${origin}/?cart=open`, thankYouPageUrl: `${origin}/order-confirmation` },
  });
  const url = session?.redirectSession?.fullUrl;
  if (!url) throw new Error("Checkout couldn't start: no redirect URL returned.");
  return url;
}
