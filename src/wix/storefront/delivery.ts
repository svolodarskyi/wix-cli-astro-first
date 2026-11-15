// Delivery estimate for the cart drawer: set the visitor cart's delivery address (province +
// postal code), then ask Wix to estimate delivery + tax. Wix picks the delivery method from the
// store's own shipping rules (e.g. "Calgary city-limit" $7, courier $12, free over $150) — nothing
// about shipping is hard-coded here.
// docs: https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/purchase-flow/cart-v2/update-current-cart
//       https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/purchase-flow/cart-v2/estimate-current-cart
import { currentCartV2 } from "@wix/ecom";
import { wixModule } from "../sdk";

const cartApi = wixModule(currentCartV2);

export interface DeliveryAddress {
  /** ISO 3166-2 subdivision, e.g. "CA-AB". */
  subdivision: string;
  postalCode: string;
}

export interface DeliveryEstimate {
  /** The method Wix chose from the store's rules, e.g. "Calgary city-limit". */
  method: string;
  delivery: number;
  tax: number;
  total: number;
  /** Free delivery (rate is 0). */
  free: boolean;
}

export const CA_PROVINCES: [string, string][] = [
  ["CA-AB", "Alberta"], ["CA-BC", "British Columbia"], ["CA-MB", "Manitoba"], ["CA-NB", "New Brunswick"],
  ["CA-NL", "Newfoundland and Labrador"], ["CA-NS", "Nova Scotia"], ["CA-NT", "Northwest Territories"],
  ["CA-NU", "Nunavut"], ["CA-ON", "Ontario"], ["CA-PE", "Prince Edward Island"], ["CA-QC", "Quebec"],
  ["CA-SK", "Saskatchewan"], ["CA-YT", "Yukon"],
];

const POSTAL = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

export function normalizePostal(raw: string): string | null {
  const s = raw.trim();
  if (!POSTAL.test(s)) return null;
  const c = s.replace(/[ -]/g, "").toUpperCase();
  return `${c.slice(0, 3)} ${c.slice(3)}`;
}

export async function estimateDelivery(a: DeliveryAddress): Promise<DeliveryEstimate> {
  const postalCode = normalizePostal(a.postalCode);
  if (!postalCode) throw new Error("Enter a valid Canadian postal code, like T2N 1N4.");
  try {
    await cartApi.updateCurrentCart({ deliveryInfo: { address: { country: "CA", subdivision: a.subdivision, postalCode } } } as any);
    const res: any = await cartApi.estimateCurrentCart({ calculateDelivery: true, calculateTax: true } as any);
    const s = res?.summary;
    const num = (m: any) => Number(m?.amount ?? 0);
    const method = s?.deliverySummary?.method?.title?.translated ?? s?.deliverySummary?.method?.title?.original;
    if (!method) throw new Error("We don't deliver to that address. Please check it or contact us.");
    const delivery = num(s.priceSummary?.delivery);
    return { method, delivery, tax: num(s.priceSummary?.tax), total: num(s.priceSummary?.total), free: delivery === 0 };
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "We couldn't estimate delivery just now. Please try again.");
  }
}
