import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckout, shopifyEnabled } from "@/lib/shopify";

export const dynamic = "force-dynamic";

const schema = z.object({
  lines: z
    .array(
      z.object({
        // Shopify variant gid, e.g. gid://shopify/ProductVariant/123
        merchandiseId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(50),
});

// Create a Shopify cart from the buyer's selected variants and return the hosted
// checkout URL. The client redirects there; Shopify owns payment, tax & shipping.
export async function POST(req: Request) {
  if (!shopifyEnabled()) {
    return NextResponse.json({ error: "Shopify checkout is not configured yet" }, { status: 503 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid cart" }, { status: 400 });

  try {
    const { checkoutUrl, cartId } = await createCheckout(parsed.data.lines);
    return NextResponse.json({ ok: true, checkoutUrl, cartId });
  } catch (e) {
    return NextResponse.json({ error: "Could not start Shopify checkout" }, { status: 502 });
  }
}
