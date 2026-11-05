import { NextResponse } from "next/server";
import { getSealedProductBySlug } from "@/lib/sealed-import";
import { AMAZON_CLOCK, amazonLivePrice } from "@/lib/amazon-live";
import { COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";

// Amazon's own price of a sealed product in one market (lib/amazon-live.ts), asked by the sealed page's Amazon row
// from the browser. One Creators API search per answer; the CDN keeps it six hours (a day stale), so a product costs
// at most four calls a day per market, and nothing is stored: Amazon's licence lets a price be shown for 24 hours
// with its time, never kept. A refused store (no API access yet) is kept six hours too; an error is not kept. Reads
// the same sealed loader as the page (no query of its own).
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{1,160}$/;
const SIX_H = "public, s-maxage=21600, stale-while-revalidate=86400";
// An error (Amazon unreachable, a bad answer) is not kept: the next visitor's load asks again.
const NO_STORE = "no-store";
const NOINDEX = { "X-Robots-Tag": "noindex" };

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const c = (new URL(req.url).searchParams.get("c") ?? "").toUpperCase();
  if (!SLUG.test(params.slug) || !(c in COUNTRIES)) return NextResponse.json({ status: "error" }, { status: 404, headers: NOINDEX });
  const country = c as Country;
  try {
    const g = (await getSealedProductBySlug(params.slug))[country];
    if (!g) return NextResponse.json({ status: "none" }, { status: 404, headers: { ...NOINDEX, "Cache-Control": SIX_H } });
    const a = await amazonLivePrice(g, country);
    const clock = AMAZON_CLOCK[country];
    const body = a.status === "ok" ? { ...a, price: formatMoney(a.priceCents!, a.currency), timeZone: clock?.timeZone, zoneLabel: clock?.label } : { status: a.status };
    return NextResponse.json(body, { headers: { ...NOINDEX, "Cache-Control": a.status === "error" ? NO_STORE : SIX_H } });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500, headers: { ...NOINDEX, "Cache-Control": NO_STORE } });
  }
}
