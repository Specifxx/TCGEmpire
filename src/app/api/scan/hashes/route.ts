import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Perceptual hashes of every card (from blur placeholders) so the scanner can do
// visual matching on-device. Small payload; CDN-cached for an hour.
export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await prisma.card.findMany({
    where: { imageHash: { not: null } },
    select: { id: true, imageHash: true },
  });
  return NextResponse.json(
    { hashes: cards.map((c) => ({ id: c.id, h: c.imageHash as string })) },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
