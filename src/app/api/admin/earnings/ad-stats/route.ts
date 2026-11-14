import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { AD_STATS_KEY, AD_TESTS, parseAdStats, type AdStats } from "@/lib/earnings/ad-tests";
import { readStored, writeStored } from "@/lib/earnings/stored";
import { liveRoute } from "@/lib/public-data/live-route";

export const dynamic = "force-dynamic";

// The ad tests' network figures for /admin/earnings (2026-11-14; lib/earnings/ad-tests.ts
// says why they are posted rather than fetched). POST { stats: { <test id>: { spend,
// currency, impressions, linkClicks, visitors, delivery, asOf } } } merges into the one
// stored row; GET returns it with the test list. Same gate as the cost entries: a
// signed-in admin, or ADMIN_TOKEN.
async function allowed(key: unknown): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (token && key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

async function current(): Promise<Record<string, AdStats>> {
  return (await readStored<Record<string, AdStats>>([AD_STATS_KEY])).get(AD_STATS_KEY) ?? {};
}

async function handleGET(req: Request) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!(await allowed(key))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ tests: AD_TESTS, stats: await current() });
}

async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!(await allowed(body?.key))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const posted = parseAdStats(body);
  if (!Object.keys(posted).length) return NextResponse.json({ error: "No figures for a known ad test" }, { status: 400 });
  const merged = { ...(await current()), ...posted };
  await writeStored(AD_STATS_KEY, merged);
  return NextResponse.json({ ok: true, saved: Object.keys(posted) });
}

export const GET = liveRoute(handleGET);
export const POST = liveRoute(handlePOST);
