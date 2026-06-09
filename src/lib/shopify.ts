// Shopify Storefront API client — foundations for running the official store on
// Shopify and surfacing it inside RiftCompare.
//
// Model (single-seller): you (Specifix) run one Shopify store holding the official
// inventory. RiftCompare reads that catalog through the Storefront API and renders
// it in the marketplace / price comparison; "Buy" hands off to Shopify's HOSTED
// checkout (cartCreate → checkoutUrl), so Shopify handles cards, tax, fraud and
// carrier-calculated shipping. No PCI scope, no Stripe Connect, no payout plumbing
// on our side.
//
// Everything here is INERT until the two env vars below are set, so this ships
// safely with the integration "off".

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? ""; // e.g. riftcompare.myshopify.com
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN ?? "";
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2024-10";

export function shopifyEnabled(): boolean {
  return Boolean(STORE_DOMAIN && STOREFRONT_TOKEN);
}

function endpoint(): string {
  return `https://${STORE_DOMAIN}/api/${API_VERSION}/graphql.json`;
}

class ShopifyError extends Error {}

// Low-level GraphQL fetch against the Storefront API. Throws on transport or
// GraphQL errors; callers decide whether to swallow.
export async function storefront<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  if (!shopifyEnabled()) throw new ShopifyError("Shopify is not configured");
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
    // Storefront catalog is fine to cache briefly; cart calls pass their own opts.
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new ShopifyError(`Shopify HTTP ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new ShopifyError(json.errors.map((e) => e.message).join("; "));
  if (!json.data) throw new ShopifyError("Shopify returned no data");
  return json.data;
}

// ── Normalised shapes RiftCompare renders ───────────────────────────────────────
export type ShopifyVariant = {
  id: string; // gid://shopify/ProductVariant/… — pass to the cart as merchandiseId
  title: string;
  sku: string | null;
  priceCents: number;
  currency: string;
  availableForSale: boolean;
  quantityAvailable: number | null;
};

export type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  imageUrl: string | null;
  onlineStoreUrl: string | null;
  variants: ShopifyVariant[];
};

function moneyToCents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        description
        onlineStoreUrl
        featuredImage { url }
        variants(first: 10) {
          nodes {
            id
            title
            sku
            availableForSale
            quantityAvailable
            price { amount currencyCode }
          }
        }
      }
    }
  }
`;

// Fetch the storefront catalog (one page; pass `after` to paginate). Returns []
// when Shopify isn't configured so callers can render nothing gracefully.
export async function getShopifyProducts(
  first = 50,
  after?: string,
): Promise<{ products: ShopifyProduct[]; nextCursor: string | null }> {
  if (!shopifyEnabled()) return { products: [], nextCursor: null };
  const data = await storefront<{
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: any[];
    };
  }>(PRODUCTS_QUERY, { first, after: after ?? null });

  const products: ShopifyProduct[] = data.products.nodes.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    description: p.description ?? "",
    imageUrl: p.featuredImage?.url ?? null,
    onlineStoreUrl: p.onlineStoreUrl ?? null,
    variants: (p.variants?.nodes ?? []).map((v: any) => ({
      id: v.id,
      title: v.title,
      sku: v.sku ?? null,
      priceCents: moneyToCents(v.price.amount),
      currency: v.price.currencyCode,
      availableForSale: !!v.availableForSale,
      quantityAvailable: v.quantityAvailable ?? null,
    })),
  }));
  return { products, nextCursor: data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null };
}

const CART_CREATE = /* GraphQL */ `
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart { id checkoutUrl }
      userErrors { message }
    }
  }
`;

export type CartLine = { merchandiseId: string; quantity: number };

// Create a Shopify cart from variant lines and return the hosted checkout URL to
// redirect the buyer to. Shopify owns the rest of the purchase from here.
export async function createCheckout(
  lines: CartLine[],
): Promise<{ checkoutUrl: string; cartId: string }> {
  const data = await storefront<{
    cartCreate: { cart: { id: string; checkoutUrl: string } | null; userErrors: { message: string }[] };
  }>(CART_CREATE, { lines });
  const errs = data.cartCreate.userErrors;
  if (errs?.length) throw new ShopifyError(errs.map((e) => e.message).join("; "));
  const cart = data.cartCreate.cart;
  if (!cart) throw new ShopifyError("Shopify did not return a cart");
  return { checkoutUrl: cart.checkoutUrl, cartId: cart.id };
}

// How we link a Shopify variant back to a RiftCompare card: store the RiftCompare
// card slug (or id) in the variant SKU, e.g. SKU "card:viktor-machine-herald". This
// lets us match catalog → cards without a separate mapping table.
export const SKU_CARD_PREFIX = "card:";
export function cardKeyFromSku(sku: string | null): string | null {
  if (!sku) return null;
  return sku.startsWith(SKU_CARD_PREFIX) ? sku.slice(SKU_CARD_PREFIX.length) : null;
}
