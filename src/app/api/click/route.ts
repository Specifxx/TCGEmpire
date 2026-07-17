import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dbHistory } from "@/lib/db-history";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const COUNTRIES = new Set(["AU", "NZ", "US", "UK", "SG"]);
const KINDS = new Set(["single", "sealed"]);

// Click beacon: records one outbound affiliate-link click so we can verify our
// store/eBay links are actually being used. Always returns 204 (a beacon must never
// surface an error), and bad input is silently ignored.
//
// Rate-limited unlike other public endpoints in this app until now — this is a
// public, unauthenticated, no-Origin-check write straight to the history database
// (see lib/db-history.ts), so a scripted flood here writes unbounded ClickEvent rows
// with no cost to the caller. Over the limit, we just skip the write (still 204 —
// a beacon must never surface an error to the caller).
export async function POST(req: Request) {
  const ok = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const rl = rateLimit(`click:${clientIp(req)}`, 120, 60_000); // 120/min/IP — generous for a real browsing session
    if (!rl.ok) return ok;

    const body = await req.json().catch(() => null);
    const retailer = typeof body?.retailer === "string" ? body.retailer.slice(0, 40) : "";
    if (!retailer) return ok;
    const country = COUNTRIES.has(body.country) ? body.country : "AU";
    const kind = KINDS.has(body.kind) ? body.kind : "single";
    // The page the click came from (which card/product). Keep it a path only.
    const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 200) : null;
    await dbHistory.clickEvent.create({ data: { retailer, country, kind, path } });
  } catch {
    /* never fail a beacon */
  }
  return ok;
}
