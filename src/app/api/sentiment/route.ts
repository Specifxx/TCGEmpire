import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { allowedOrigin, corsHeaders } from "@/lib/sister-alerts/sites";
import { PRODUCT_ID, PULSE_CHOICES, PULSE_SITES, parseIds, pulseVoter, pulses } from "@/lib/sentiment";

export const dynamic = "force-dynamic";

// Collector pulse: "buying / holding / skipping" on a sister site's product page (lib/sentiment.ts).
// Cross-origin from the sites in PULSE_SITES only (exact origins). GET is the CDN-cached pulse (six hours, the floor for a
// route); POST is one answer, uncached, and answers with that product's pulse. A second tap on the same choice takes it back.

const CDN = "public, s-maxage=21600, stale-while-revalidate=86400";

async function read(site: string, ids: string[]) {
  if (ids.length === 0) return {};
  const rows = await prisma.sentimentVote.groupBy({
    by: ["productId", "choice"],
    where: { site, productId: { in: ids } },
    _count: { _all: true },
  });
  return pulses(rows.map((r) => ({ productId: r.productId, choice: r.choice, n: r._count._all })));
}

function siteFor(origin: string | null) {
  const s = allowedOrigin(origin);
  return s && (PULSE_SITES as readonly string[]).includes(s.key) ? s : null;
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: siteFor(origin) ? 204 : 403, headers: corsHeaders(origin) });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = url.searchParams.get("site") ?? "";
  if (!(PULSE_SITES as readonly string[]).includes(site)) return NextResponse.json({ error: "unknown site" }, { status: 400 });
  const ids = parseIds(url.searchParams.get("ids"));
  const headers = { "Access-Control-Allow-Origin": "*", "Cache-Control": CDN, "Vercel-CDN-Cache-Control": CDN };
  try {
    return NextResponse.json({ pulses: await read(site, ids) }, { headers });
  } catch (e) {
    console.warn("[sentiment] read failed:", e);
    return NextResponse.json({ pulses: {} }, { status: 503, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  }
}

const schema = z.object({ product: z.string().regex(PRODUCT_ID), choice: z.enum([...PULSE_CHOICES, "clear"]) });

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store" };
  const site = siteFor(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const ip = clientIp(req);
  const rl = rateLimit(`sentiment:${ip}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many answers. Try again in a minute." }, { status: 429, headers });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad answer" }, { status: 400, headers });
  const { product, choice } = parsed.data;
  const voter = pulseVoter(ip, req.headers.get("user-agent") ?? "");
  const key = { site: site.key, productId: product, voter };
  try {
    if (choice === "clear") await prisma.sentimentVote.deleteMany({ where: key });
    else await prisma.sentimentVote.upsert({ where: { site_productId_voter: key }, create: { ...key, choice }, update: { choice } });
    const p = (await read(site.key, [product]))[product] ?? { n: 0 };
    return NextResponse.json({ ok: true, mine: choice === "clear" ? null : choice, pulse: p }, { headers });
  } catch (e) {
    console.warn("[sentiment] vote failed:", e);
    return NextResponse.json({ error: "Couldn't save your answer." }, { status: 503, headers });
  }
}
