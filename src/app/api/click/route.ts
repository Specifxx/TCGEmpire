import { NextResponse } from "next/server";
import { clickGroup, countClick, countStoreClick } from "@/lib/click-counter";
import { countClickMix } from "@/lib/click-mix";
import { RETAILERS } from "@/lib/retailers";

export const dynamic = "force-dynamic";

// Click beacon (2026-10-27, "Click counts by day" in DECISIONS.md): one Counter
// upsert per outbound click, per Sydney day and network, for /admin/growth. It
// used to write one ClickEvent row per eBay click to the history database and
// was switched off for Neon transfer; this writes one tiny row and reads
// nothing. Always answers 204, so a beacon never waits on the database.
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const retailer = q.get("r") ?? "";
  const group = clickGroup(retailer);
  if (group) await countClick(group).catch(() => {});
  // The straight-to-checkout test: a click whose link opened a checkout, counted
  // beside its network (never instead of it). Only a store link can be one.
  if (group === "store" && new URL(req.url).searchParams.get("t") === "checkout") await countClick("checkout").catch(() => {});
  // The click mix (lib/click-mix.ts): market, paid or not, page, list position and
  // price gap vs the cheapest, as closed-set buckets in one more Counter row.
  if (group) {
    await countClickMix({ retailer, country: q.get("c"), paid: q.get("paid"), page: q.get("pg"), position: q.get("p"), gap: q.get("g") }).catch(() => {});
  }
  // Per-store monthly count for the partner pitch, known stores only.
  if (group === "store" && Object.prototype.hasOwnProperty.call(RETAILERS, retailer)) {
    await countStoreClick(retailer).catch(() => {});
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
