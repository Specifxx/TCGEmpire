import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authSecret } from "@/lib/auth-secret";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { MAX_VOTERS_PER_IP_PER_STORE, VOTES_PER_IP_PER_HOUR, parseStoreVote } from "@/lib/store-votes/core";
import { voteCorsHeaders, voteSiteForOrigin } from "@/lib/store-votes/origin";
import { getStoreTally } from "@/lib/store-votes/read";

export const dynamic = "force-dynamic";

// STORE THUMBS UP / DOWN FOR EVERY SITE (owner, 2026-11-06; lib/store-votes/).
//
// GET: the public tally, { at, stores: { "<host>": [up, down] } }, for any
// origin; the CDN keeps it six hours (the family's cached-route floor).
//
// POST (text/plain JSON { store, vote: 1 | -1 | 0, vid }): from RiftCompare and
// the sister sites' exact origins only. One vote per browser per store
// (`vid` is a random id the browser keeps; a second vote changes the first, 0
// takes it back), at most MAX_VOTERS_PER_IP_PER_STORE browsers per network per
// store, VOTES_PER_IP_PER_HOUR sends per network. Only keyed hashes of the
// browser id and the network are stored, never the address itself, and
// nothing is emailed (owner, 2026-10-27).

function h(kind: string, value: string): string {
  return createHmac("sha256", Buffer.from(authSecret())).update(`store-vote:${kind}:${value}`).digest("hex").slice(0, 32);
}

export async function GET() {
  const tally = await getStoreTally();
  return Response.json(tally, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: voteSiteForOrigin(origin) ? 204 : 403, headers: voteCorsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...voteCorsHeaders(origin), "Cache-Control": "no-store" };
  const site = voteSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });

  const ip = clientIp(req);
  const rl = rateLimit(`store-votes:${ip}`, VOTES_PER_IP_PER_HOUR, 60 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many votes from here just now." }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfter) } });

  const raw = await req.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(raw.slice(0, 2000));
  } catch {
    body = null;
  }
  const p = parseStoreVote(body);
  if (p.kind === "error") return NextResponse.json({ error: p.error }, { status: 400, headers });

  try {
    const voter = h("vid", p.vid);
    const net = h("ip", ip);
    if (p.vote === 0) {
      await prisma.storeVote.deleteMany({ where: { store: p.store, voter } });
      return NextResponse.json({ ok: true }, { headers });
    }
    const existing = await prisma.storeVote.findUnique({ where: { store_voter: { store: p.store, voter } }, select: { id: true } });
    if (existing) {
      await prisma.storeVote.update({ where: { id: existing.id }, data: { vote: p.vote, site } });
      return NextResponse.json({ ok: true }, { headers });
    }
    const sameNet = await prisma.storeVote.count({ where: { store: p.store, ipHash: net } });
    // Answered like a counted vote: telling a farm which votes landed only helps it.
    if (sameNet >= MAX_VOTERS_PER_IP_PER_STORE) return NextResponse.json({ ok: true }, { headers });
    await prisma.storeVote.create({ data: { store: p.store, voter, ipHash: net, vote: p.vote, site } });
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ error: "Couldn't save that right now." }, { status: 500, headers });
  }
}
