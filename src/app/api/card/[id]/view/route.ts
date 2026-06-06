import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Record a card view (modal open / card-page visit). Fire-and-forget from the
// client. Accepts slug or id. This popularity signal drives eBay prioritisation.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.card.updateMany({
      where: { OR: [{ slug: params.id }, { id: params.id }] },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  } catch {
    /* best-effort */
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
