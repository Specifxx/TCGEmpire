import { NextResponse } from "next/server";
import { clickGroup, countClick } from "@/lib/click-counter";

export const dynamic = "force-dynamic";

// Click beacon (2026-10-27, "Click counts by day" in DECISIONS.md): one Counter
// upsert per outbound click, per Sydney day and network, for /admin/growth. It
// used to write one ClickEvent row per eBay click to the history database and
// was switched off for Neon transfer; this writes one tiny row and reads
// nothing. Always answers 204, so a beacon never waits on the database.
export async function POST(req: Request) {
  const retailer = new URL(req.url).searchParams.get("r") ?? "";
  const group = clickGroup(retailer);
  if (group) await countClick(group).catch(() => {});
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
