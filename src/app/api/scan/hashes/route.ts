import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Serves the perceptual hashes of every card image so the camera scanner can match
// a capture entirely on-device (no images leave the phone). Small payload (~id+hash
// per card). Computed per-request but cached at the CDN for an hour (header below),
// so it's effectively static without needing a build-time DB connection.
export const dynamic = "force-dynamic";

export async function GET() {
  const cards = await prisma.card.findMany({
    where: { imageHash: { not: null } },
    select: { id: true, imageHash: true },
  });
  const hashes = cards.map((c) => ({ id: c.id, h: c.imageHash as string }));
  return NextResponse.json(
    { hashes },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  );
}
