import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/rate-limit";
import { readAnyCard, scanCostUsd, SCAN_MODEL } from "@/lib/scan/read";
import { SCAN_MAX_IMAGE_BYTES, utcDay } from "@/lib/scan/caps";
import { sisterDayKey, sisterScanConfig, sisterScanCors, sisterScanSite, sisterVisitorKey } from "@/lib/scan/sister";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The card scanner for sister sites (lib/scan/sister.ts; DECISIONS.md 2026-11-20 "Card scanner for TCG Singles DB").
// Cross-origin from an exact sister origin only. POST { image: <base64 JPEG>, game: <slug> } -> what was read. One
// Haiku call, never eBay, never a session or cookie, the photo is not stored. The sister matches the reading itself.
export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: sisterScanCors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const site = sisterScanSite(origin);
  const headers = { ...sisterScanCors(origin), "Cache-Control": "private, no-store" };
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
  if (!site) return json({ error: "Not allowed." }, 403);
  const cfg = sisterScanConfig();
  if (!cfg.enabled) return json({ error: "The scanner is not switched on." }, 404);

  const body = (await req.json().catch(() => null)) as { image?: unknown; game?: unknown } | null;
  const image = typeof body?.image === "string" ? body.image.replace(/^data:image\/\w+;base64,/, "") : "";
  if (!image || image.length > SCAN_MAX_IMAGE_BYTES || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) {
    return json({ error: "That photo didn't come through. Try again." }, 400);
  }
  const game = typeof body?.game === "string" && site.games.includes(body.game) ? body.game : null;

  const day = utcDay();
  const dayKey = sisterDayKey(site.key, day);
  const visitorKey = sisterVisitorKey(site.key, clientIp(req), day, process.env.AUTH_SECRET || "scan");
  const total = await prisma.counter.upsert({ where: { key: dayKey }, create: { key: dayKey, value: 1 }, update: { value: { increment: 1 } } });
  if (total.value > cfg.dailyCap) return json({ error: "The scanner has had a busy day. Try again tomorrow, or search for the card by name." }, 429);
  const mine = await prisma.counter.upsert({ where: { key: visitorKey }, create: { key: visitorKey, value: 1 }, update: { value: { increment: 1 } } });
  if (mine.value > cfg.perVisitor) {
    await prisma.counter.update({ where: { key: dayKey }, data: { value: { decrement: 1 } } }).catch(() => {});
    return json({ error: `That's your ${cfg.perVisitor} free scans for today. They come back tomorrow.`, limited: true, remaining: 0 }, 429);
  }

  try {
    const r = await readAnyCard(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 20_000 }), image, game);
    return json({ reading: r.reading, ms: r.ms, model: SCAN_MODEL, costUsd: Number(scanCostUsd(r.usage).toFixed(6)), remaining: cfg.perVisitor - mine.value });
  } catch (e) {
    // Our failure, not the visitor's: the read is given back.
    await prisma.counter.update({ where: { key: dayKey }, data: { value: { decrement: 1 } } }).catch(() => {});
    await prisma.counter.update({ where: { key: visitorKey }, data: { value: { decrement: 1 } } }).catch(() => {});
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Too many scans at once. Try again in a moment." }, 429);
    return json({ error: "We couldn't read that photo right now. Try again." }, 502);
  }
}
