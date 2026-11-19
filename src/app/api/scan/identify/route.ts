import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { cardTileSelect, withStoreCounts } from "@/lib/cards";
import { getCountry } from "@/lib/get-country";
import { SCAN_MODEL } from "@/lib/scan/read";
import { identifyCard } from "@/lib/scan/identify";
import { getScanCatalog } from "@/lib/scan/catalog";
import { scanAccess, scanConfig, SCAN_MAX_IMAGE_BYTES, utcDay } from "@/lib/scan/caps";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };

// POST { image: <base64 JPEG, no data: prefix> } -> what was read (lib/scan/identify.ts), the matched card (quick-view tile data) and the
// other printings for "Wrong card?". One Haiku call, two for look-alike printings; never eBay; the photo is not stored (DECISIONS.md 2026-11-19).
export async function POST(req: Request) {
  const cfg = scanConfig();
  const user = await getCurrentUser();
  const access = scanAccess(cfg, user ? { isAdmin: user.isAdmin, premium: isPremium(user) } : null);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as { image?: unknown; first?: unknown } | null;
  const image = typeof body?.image === "string" ? body.image.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!image || image.length > SCAN_MAX_IMAGE_BYTES || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) {
    return NextResponse.json({ error: "That photo didn't come through. Try again." }, { status: 400, headers: NO_STORE });
  }

  // The site-wide day cap, then the visitor's own, each one guarded increment on a Counter row.
  const day = utcDay();
  const siteKey = `scan:day:${day}`;
  const site = await prisma.counter.upsert({ where: { key: siteKey }, create: { key: siteKey, value: 1 }, update: { value: { increment: 1 } } });
  if (site.value > cfg.dailyCap) {
    return NextResponse.json({ error: "The scanner has had a busy day. Try again tomorrow, or search for the card by name." }, { status: 429, headers: NO_STORE });
  }
  let remaining: number | null = null;
  const userKey = user ? `scan:u:${user.id}:${day}` : null;
  if (access.perUserLimit !== null && userKey) {
    const mine = await prisma.counter.upsert({ where: { key: userKey }, create: { key: userKey, value: 1 }, update: { value: { increment: 1 } } });
    if (mine.value > access.perUserLimit) {
      return NextResponse.json({ error: `That's your ${access.perUserLimit} free scans for today. They come back tomorrow.`, limited: true, limit: access.perUserLimit, remaining: 0 }, { status: 429, headers: NO_STORE });
    }
    remaining = access.perUserLimit - mine.value;
  }

  const catalog = await getScanCatalog();
  let m;
  try {
    m = await identifyCard(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 20_000 }), image, catalog);
  } catch (e) {
    // Our failure, not the visitor's: the scan is given back (site and personal counts).
    await prisma.counter.update({ where: { key: siteKey }, data: { value: { decrement: 1 } } }).catch(() => {});
    if (access.perUserLimit !== null && userKey) await prisma.counter.update({ where: { key: userKey }, data: { value: { decrement: 1 } } }).catch(() => {});
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Too many scans at once. Try again in a moment." }, { status: 429, headers: NO_STORE });
    return NextResponse.json({ error: "We couldn't read that photo right now. Try again." }, { status: 502, headers: NO_STORE });
  }

  // The funnel's denominator: a visit's first successful scan (the page sends `first` once). DECISIONS.md 2026-11-19.
  if (body?.first === true) {
    const sessKey = `scan:sess:${day}`;
    await prisma.counter.upsert({ where: { key: sessKey }, create: { key: sessKey, value: 1 }, update: { value: { increment: 1 } } }).catch(() => {});
  }

  const ids = m.bestId ? [m.bestId, ...m.alternateIds] : [];
  const country = getCountry();
  const rows = ids.length
    ? await withStoreCounts(await prisma.card.findMany({ where: { id: { in: ids } }, select: cardTileSelect(country) }))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return NextResponse.json(
    {
      reading: m.reading,
      confidence: m.confidence,
      why: m.why,
      card: m.bestId ? byId.get(m.bestId) ?? null : null,
      alternates: m.alternateIds.map((id) => byId.get(id)).filter(Boolean),
      ms: m.ms,
      model: SCAN_MODEL,
      twinCheck: m.twinCheck,
      costUsd: Number(m.costUsd.toFixed(6)),
      remaining,
    },
    { headers: NO_STORE },
  );
}
