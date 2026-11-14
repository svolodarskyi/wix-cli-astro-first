// Server-side shop data for the design's shop / tea-ware pages: editorial section copy (design) +
// live products from the real Wix catalog. Products, prices, stock, ribbons and images are never
// written into the pages — they come from Wix on every request.
import sections from "./shop-sections.json";
import { fetchCategories, searchCatalog } from "../wix/storefront/catalog";
import type { ProductSummary } from "../wix/storefront/types";

export interface Section {
  id: string;
  title: string;
  sub: string;
  desc: string;
  slug: string | null;
  products: ProductSummary[];
  emptyText?: string;
}

type Group = "tea" | "ware";
const PARENT: Record<Group, string> = { tea: "tea", ware: "teaware" };
const MORE: Record<Group, { title: string; sub: string }> = {
  tea: { title: "More tea", sub: "Also in the shop" },
  ware: { title: "More tea ware", sub: "Also in the shop" },
};

export async function loadShop(group: Group): Promise<{ sections: Section[]; error: boolean }> {
  try {
    const cats = await fetchCategories();
    const bySlug = new Map(cats.map((c) => [c.slug, c.id]));
    const parentId = bySlug.get(PARENT[group]);
    const defs = (sections as Record<Group, Omit<Section, "products">[]>)[group];
    const [all, ...perSection] = await Promise.all([
      parentId ? searchCatalog({ categoryId: parentId, limit: 100 }) : Promise.resolve({ products: [] as ProductSummary[] }),
      ...defs.map((d) => {
        const id = d.slug ? bySlug.get(d.slug) : undefined;
        return id ? searchCatalog({ categoryId: id, limit: 100 }) : Promise.resolve({ products: [] as ProductSummary[] });
      }),
    ]);
    const inParent = new Set(all.products.map((p) => p.id));
    const seen = new Set<string>();
    const out: Section[] = defs.map((d, i) => {
      const products = perSection[i].products.filter((p) => inParent.has(p.id) && !seen.has(p.id));
      products.forEach((p) => seen.add(p.id));
      return { ...d, products, emptyText: d.id === "gift-set" ? "New gift sets are coming soon." : undefined };
    });
    // anything in the parent category the editorial sections don't cover still shows
    const rest = all.products.filter((p) => !seen.has(p.id));
    if (rest.length) out.push({ id: "more", ...MORE[group], desc: "", slug: null, products: rest });
    // sections with nothing in them are dropped, except the design's "coming soon" gift set
    return { sections: out.filter((s) => s.products.length || s.emptyText), error: false };
  } catch {
    return { sections: [], error: true };
  }
}

/** Wix formats CAD as "C$15.00"; the design shows "$15.00". */
export const fmt = (s: string | null | undefined) => (s ?? "").replace(/^C\$/, "$");
