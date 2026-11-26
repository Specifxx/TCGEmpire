import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { allowedOrigin, corsHeaders } from "@/lib/sister-alerts/sites";
import { DEAL_VOTE_SITES, DROP_ID, EMPTY, apply, parseIds, tallies, voterId } from "@/lib/deal-votes";

export const dynamic = "force-dynamic";

// Hot/cold votes and the "expired" flag on a sister site's Sealed Sniper drops (lib/deal-votes.ts).
// Cross-origin from the sites in DEAL_VOTE_SITES only (exact origins). GET is the CDN-cached tally
// (six hours, the floor for a route); POST is one vote, uncached, and answers with that drop's tally.

const CDN = "public, s-maxage=21600, stale-while-revalidate=86400";

async function read(site: string, ids: string[]) {
  if (ids.length === 0) return {};
  const rows = await prisma.dealVote.groupBy({
    by: ["dropId", "vote", "expired"],
    where: { site, dropId: { in: ids } },
    _count: { _all: true },
  });
  return tallies(rows.map((r) => ({ dropId: r.dropId, vote: r.vote, expired: r.expired, n: r._count._all })));
}

function siteFor(origin: string | null) {
  const s = allowedOrigin(origin);
  return s && (DEAL_VOTE_SITES as readonly string[]).includes(s.key) ? s : null;
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: siteFor(origin) ? 204 : 403, headers: corsHeaders(origin) });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";
  if (!(DEAL_VOTE_SITES as readonly string[]).includes(site)) return NextResponse.json({ error: "unknown site" }, { status: 400 });
  const ids = parseIds(url.searchParams.get("ids"));
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN };
  try {
    return NextResponse.json({ tallies: await read(site, ids) }, { headers });
  } catch (e) {
    console.warn("[deal-votes] read failed:", e);
    return NextResponse.json({ tallies: {} }, { status: 503, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  }
}

const schema = z.object({ drop: z.string().regex(DROP_ID), action: z.enum(["hot", "cold", "expired", "clear"]) });

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store" };
  const site = siteFor(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const ip = clientIp(req);
  const rl = rateLimit(`deal-votes:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many votes. Try again in a minute." }, { status: 429, headers });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad vote" }, { status: 400, headers });
  const { drop, action } = parsed.data;
  const voter = voterId(ip, req.headers.get("user-agent") ?? "");
  const where = { site_dropId_voter: { site: site.key, dropId: drop, voter } };
  try {
    const prev = await prisma.dealVote.findUnique({ where, select: { vote: true, expired: true } });
    const next = apply(prev, action);
    if (!next) await prisma.dealVote.deleteMany({ where: { site: site.key, dropId: drop, voter } });
    else await prisma.dealVote.upsert({ where, create: { site: site.key, dropId: drop, voter, ...next }, update: next });
    const t = (await read(site.key, [drop]))[drop] ?? EMPTY;
    return NextResponse.json({ ok: true, mine: next ?? { vote: 0, expired: false }, tally: t }, { headers });
  } catch (e) {
    console.warn("[deal-votes] vote failed:", e);
    return NextResponse.json({ error: "Couldn't save your vote." }, { status: 503, headers });
  }
}
