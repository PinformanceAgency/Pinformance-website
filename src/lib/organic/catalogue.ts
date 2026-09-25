/**
 * What kind of shop this is, read from its own URL pool.
 *
 * Every store used to be treated the same way when URLs were proposed, and
 * that is wrong in both directions. A store with four hundred products
 * (Nordheim, Sarah Oliver, Celestia) should run its waterfalls on product
 * pages: a blog post is a detour between the pin and the thing it shows.
 * A store with one or a few products (The Longevity store: four products,
 * 132 blog posts) cannot: a waterfall per product would run out in a month
 * and put the same page back before its cooldown clears, so its blog and
 * educational pages are what give it enough distinct URLs.
 *
 * So the preference follows the catalogue, and it is only ever an ORDER.
 * Nothing is filtered out: a product-led store may still start a cycle on a
 * blog post, it is just not what the tool offers first. Pure on purpose —
 * client components import it.
 */

export type CatalogueMode = "PRODUCT_LED" | "CONTENT_LED";

/** From this many product pages in the pool, product pages lead. Below it a
 *  store does not have enough of them to carry its waterfalls alone. */
export const PRODUCT_LED_MIN = 10;

export interface CatalogueProfile {
  mode: CatalogueMode;
  products: number;
  total: number;
  /** One line for the screen, so the order is never a mystery. */
  why: string;
}

export function catalogueProfile(countsByType: Record<string, number>): CatalogueProfile {
  const products = countsByType.PRODUCT ?? 0;
  const total = Object.values(countsByType).reduce((s, n) => s + n, 0);
  const mode: CatalogueMode = products >= PRODUCT_LED_MIN ? "PRODUCT_LED" : "CONTENT_LED";
  const why = mode === "PRODUCT_LED"
    ? `${products} product pages in the pool, so product pages go first and blog posts last`
    : `only ${products} product page${products === 1 ? "" : "s"} in the pool, so blog and educational pages stay on equal footing, they are what gives this store enough distinct URLs`;
  return { mode, products, total, why };
}

/** Lower is offered first. Content-led stores have no type preference. */
export function typeRank(mode: CatalogueMode, type: string | null | undefined): number {
  if (mode === "CONTENT_LED") return 0;
  switch (type) {
    case "PRODUCT": return 0;
    case "COLLECTION": return 1;
    case "GALLERY":
    case "SELECTION": return 2;
    case "BLOG": return 3;
    default: return 2;
  }
}

/** A type the store's catalogue says should not lead. */
export function isDeprioritised(mode: CatalogueMode, type: string | null | undefined): boolean {
  return mode === "PRODUCT_LED" && type === "BLOG";
}
