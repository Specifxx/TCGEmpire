import { NextResponse } from "next/server";
import { topHunters } from "@/lib/contributions-server";
import { monthKey, monthRange } from "@/lib/contributions";
import { SISTER_PREMIUM_SITES } from "@/lib/sister-premium";

export const dynamic = "force-dynamic";

// The month's Top deal hunters (lib/contributions.ts): handles and points only, never an email, an id or the team.
// GET ?site=<key|rift|all>&month=YYYY-MM (default this month). Public, CDN-cached six hours (CLAUDE.md: no route under 21600).

const CDN = "public, s-maxage=21600, stale-while-revalidate=86400";
const SITES = new Set(["all", "rift", ...SISTER_PREMIUM_SITES.map((s) => s.key)]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "all";
  const month = url.searchParams.get("month") ?? monthKey(new Date());
  const base = { "Access-Control-Allow-Origin": "*" };
  if (!SITES.has(site) || !monthRange(month)) return NextResponse.json({ error: "Unknown site or month" }, { status: 400, headers: { ...base, "Cache-Control": "no-store" } });
  try {
    const top = await topHunters(site, month);
    return NextResponse.json({ site, month, top }, { headers: { ...base, "Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN } });
  } catch (e) {
    console.warn("[community] top failed:", e);
    return NextResponse.json({ site, month, top: [] }, { status: 503, headers: { ...base, "Cache-Control": "no-store" } });
  }
}
