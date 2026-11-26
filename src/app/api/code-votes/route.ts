import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { allowedOrigin, corsHeaders } from "@/lib/sister-alerts/sites";
import { voterId } from "@/lib/deal-votes";
import { CODE_ID, CODE_SITE, CODE_VOTE_SITES, EMPTY_CODE, applyCode, codeTallies, parseCodeIds } from "@/lib/code-votes";

export const dynamic = "force-dynamic";

// "Worked / didn't work / expired" on a sister site's discount codes (lib/code-votes.ts), stored in the deal board's
// DealVote table under site "codes". Cross-origin from the sites in CODE_VOTE_SITES only (exact origins). GET is the
// CDN-cached tally (six hours, the floor for a route); POST is one vote, uncached, and answers with that code's tally.

const CDN = "public, s-maxage=21600, stale-while-revalidate=86400";

async function read(ids: string[]) {
  if (ids.length === 0) return {};
  const rows = await prisma.dealVote.groupBy({
    by: ["dropId", "vote", "expired"],
    where: { site: CODE_SITE, dropId: { in: ids } },
    _count: { _all: true },
    _max: { at: true },
  });
  return codeTallies(rows.map((r) => ({ dropId: r.dropId, vote: r.vote, expired: r.expired, n: r._count._all, last: r._max.at })));
}

function siteFor(origin: string | null) {
  const s = allowedOrigin(origin);
  return s && (CODE_VOTE_SITES as readonly string[]).includes(s.key) ? s : null;
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: siteFor(origin) ? 204 : 403, headers: corsHeaders(origin) });
}

export async function GET(req: Request) {
  const ids = parseCodeIds(new URL(req.url).searchParams.get("ids"));
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN };
  try {
    return NextResponse.json({ tallies: await read(ids) }, { headers });
  } catch (e) {
    console.warn("[code-votes] read failed:", e);
    return NextResponse.json({ tallies: {} }, { status: 503, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  }
}

const schema = z.object({ code: z.string().regex(CODE_ID), action: z.enum(["worked", "failed", "expired", "clear"]) });

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store" };
  if (!siteFor(origin)) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const ip = clientIp(req);
  const rl = rateLimit(`code-votes:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many votes. Try again in a minute." }, { status: 429, headers });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad vote" }, { status: 400, headers });
  const { code, action } = parsed.data;
  const voter = voterId(ip, req.headers.get("user-agent") ?? "");
  const where = { site_dropId_voter: { site: CODE_SITE, dropId: code, voter } };
  try {
    const prev = await prisma.dealVote.findUnique({ where, select: { vote: true, expired: true } });
    const next = applyCode(prev, action);
    if (!next) await prisma.dealVote.deleteMany({ where: { site: CODE_SITE, dropId: code, voter } });
    else await prisma.dealVote.upsert({ where, create: { site: CODE_SITE, dropId: code, voter, ...next }, update: next });
    const t = (await read([code]))[code] ?? EMPTY_CODE;
    return NextResponse.json({ ok: true, mine: next ?? { vote: 0, expired: false }, tally: t }, { headers });
  } catch (e) {
    console.warn("[code-votes] vote failed:", e);
    return NextResponse.json({ error: "Couldn't save your vote." }, { status: 503, headers });
  }
}
