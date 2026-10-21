import { NextResponse } from "next/server";
import { getBuilderCatalog } from "@/lib/deck-builder-catalog";

// The visual deck builder's card catalog (lib/deck-builder-catalog.ts). Card
// data changes once a day with the release, so it is cached for a day at the
// CDN (CLAUDE.md: no route under 21600).
export const revalidate = 86400;

export async function GET() {
  const cards = await getBuilderCatalog();
  return NextResponse.json(
    { cards },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
