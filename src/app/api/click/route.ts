import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Click beacon — DISABLED. This used to record one row per eBay-affiliate-link
// click (dbHistory.clickEvent.create) so click counts could be verified in our
// own DB independent of eBay's dashboard; that write was contributing to the
// history database's Neon network-transfer usage, so it's been switched off.
// Kept as a real route (rather than deleted) purely so any stale cached page
// still holding the old client bundle — which still calls sendBeacon("/api/click")
// until it's reloaded — gets a clean 204 instead of a 404. OutboundLink.tsx no
// longer calls this at all for new page loads. Safe to delete entirely once
// confident nothing old is still calling it.
export async function POST() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
