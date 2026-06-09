import { NextResponse } from "next/server";
import { getShopifyProducts, shopifyEnabled } from "@/lib/shopify";

export const dynamic = "force-dynamic";

// Read-only proxy for the Shopify storefront catalog. Returns an empty list (with
// enabled:false) until SHOPIFY_STORE_DOMAIN + SHOPIFY_STOREFRONT_TOKEN are set.
export async function GET(req: Request) {
  if (!shopifyEnabled()) return NextResponse.json({ enabled: false, products: [], nextCursor: null });
  const { searchParams } = new URL(req.url);
  const first = Math.min(Math.max(Number(searchParams.get("first") ?? 50), 1), 100);
  const after = searchParams.get("after") ?? undefined;
  try {
    const { products, nextCursor } = await getShopifyProducts(first, after);
    return NextResponse.json({ enabled: true, products, nextCursor });
  } catch (e) {
    return NextResponse.json({ enabled: true, error: "Shopify catalog unavailable", products: [], nextCursor: null }, { status: 502 });
  }
}
