import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CREATOR_DEALS, CREATOR_STATS_KEY, parseCreatorStats, type CreatorStats } from "@/lib/earnings/creator-deals";
import { readStored, writeStored } from "@/lib/earnings/stored";
import { liveRoute } from "@/lib/public-data/live-route";

export const dynamic = "force-dynamic";

// The paid creator deals' analytics figures for /admin/earnings (2026-11-20; lib/earnings/
// creator-deals.ts). POST { stats: { <deal id>: { buyClicks, visitors, asOf } } } merges into
// the one stored row; GET returns it with the deal list. Same gate as the ad tests: a
// signed-in admin, or ADMIN_TOKEN.
async function allowed(key: unknown): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (token && key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

async function current(): Promise<Record<string, CreatorStats>> {
  return (await readStored<Record<string, CreatorStats>>([CREATOR_STATS_KEY])).get(CREATOR_STATS_KEY) ?? {};
}

async function handleGET(req: Request) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!(await allowed(key))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ deals: CREATOR_DEALS, stats: await current() });
}

async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!(await allowed(body?.key))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const posted = parseCreatorStats(body);
  if (!Object.keys(posted).length) return NextResponse.json({ error: "No figures for a known creator deal" }, { status: 400 });
  await writeStored(CREATOR_STATS_KEY, { ...(await current()), ...posted });
  return NextResponse.json({ ok: true, saved: Object.keys(posted) });
}

export const GET = liveRoute(handleGET);
export const POST = liveRoute(handlePOST);
