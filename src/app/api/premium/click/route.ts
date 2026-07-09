import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SOURCES = new Set(["dialog", "checkout", "premium-page", "button"]);

// Premium-interest beacon: records that someone clicked a Premium CTA (opened the
// upsell dialog, etc.) so the admin can see who's interested before they convert.
// Always 204 — a beacon must never surface an error; bad input is ignored.
export async function POST(req: Request) {
  const ok = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const body = await req.json().catch(() => null);
    const source = SOURCES.has(body?.source) ? body.source : "dialog";
    const user = await getCurrentUser();
    await prisma.premiumClick.create({ data: { userId: user?.id ?? null, source } });
  } catch {
    /* never fail a beacon */
  }
  return ok;
}
