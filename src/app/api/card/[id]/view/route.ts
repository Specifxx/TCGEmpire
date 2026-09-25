import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { isBotUserAgent, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS } from "@/lib/card-views";

export const dynamic = "force-dynamic";

const noContent = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

// Record a card view. Fire-and-forget from the client; accepts slug or id.
// ?source=search marks it as a SEARCH pick (the demand signal behind Rising
// Cards, the /movers "Most searched" strip and eBay prioritisation); any other
// open just bumps the general view count.
//
// Hardened 2026-09-25 (lib/card-views.ts): crawlers and HTTP libraries get a
// 204 and never count, and each IP counts at most VIEW_RATE_LIMIT times per
// card per window. The browser already sends each card once a day per kind, so
// only a loop ever meets the limit.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (isBotUserAgent(req.headers.get("user-agent"))) return noContent();
  if (!params.id || params.id.length > 200) return noContent();
  const limited = rateLimit(`view:${clientIp(req)}:${params.id}`, VIEW_RATE_LIMIT, VIEW_RATE_WINDOW_MS);
  if (!limited.ok) {
    return new NextResponse(null, {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfter), "Cache-Control": "no-store" },
    });
  }
  const isSearch = new URL(req.url).searchParams.get("source") === "search";
  try {
    await prisma.card.updateMany({
      where: { OR: [{ slug: params.id }, { id: params.id }] },
      data: isSearch
        ? { searchCount: { increment: 1 }, lastViewedAt: new Date() }
        : { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  } catch {
    /* best-effort */
  }
  return noContent();
}
