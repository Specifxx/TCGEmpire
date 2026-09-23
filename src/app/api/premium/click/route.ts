import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremiumClickSource } from "@/lib/premium-surface";

export const dynamic = "force-dynamic";

// The allow-list lives in lib/premium-surface.ts (shared with the client and the
// checkout route): the historic sources ("recovery" = the abandoned-checkout
// email, "offer" = the one-off Premium offer email, …) plus the surfaces added
// 2026-09-23 so a click says WHICH surface produced it — "slidein",
// "nav:navbar", "gate:deal-finder", "nudge:watchlist". Anything else is coerced
// to "dialog", never written as-is.

// Premium-interest beacon: records that someone clicked a Premium CTA (opened the
// upsell dialog, etc.) so the admin can see who's interested before they convert.
// Always 204 — a beacon must never surface an error; bad input is ignored.
export async function POST(req: Request) {
  const ok = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const body = await req.json().catch(() => null);
    const source = isPremiumClickSource(body?.source) ? body.source : "dialog";
    const user = await getCurrentUser();
    await prisma.premiumClick.create({ data: { userId: user?.id ?? null, source } });
  } catch {
    /* never fail a beacon */
  }
  return ok;
}
