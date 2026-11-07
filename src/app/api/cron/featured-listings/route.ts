import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { FEATURED_TAG } from "@/lib/featured/core";
import { liveRoute } from "@/lib/public-data/live-route";

// Called by refresh-auctions.yml after the sweep has checked members' featured
// listings with eBay (lib/featured/check.ts), so /featured shows the result now
// rather than within six hours. Fails closed without CRON_SECRET.
export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  revalidateTag(FEATURED_TAG);
  revalidatePath("/featured");
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}

export const GET = liveRoute(handleGET);
