import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Record a card view. Fire-and-forget from the client; accepts slug or id.
// ?source=search marks it as a SEARCH click (the demand signal that drives eBay
// prioritisation); any other open just bumps the general view count.
export async function POST(req: Request, { params }: { params: { id: string } }) {
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
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
