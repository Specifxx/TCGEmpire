import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { scanAccess, scanConfig } from "@/lib/scan/caps";

export const dynamic = "force-dynamic";

const VERDICTS = ["right", "picked-other", "not-listed"] as const;
const CONFIDENCES = ["high", "medium", "low", "none"] as const;

// The real-world accuracy tally (DECISIONS.md 2026-11-19): after each scan the tester says whether the card was right,
// picked another printing under "Wrong card?", or found it missing. One Counter row per (confidence, verdict): counts
// only, no photo, no card, no user. GET returns the tally for the beta page.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const access = scanAccess(scanConfig(), user ? { isAdmin: user.isAdmin, premium: isPremium(user) } : null);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const b = (await req.json().catch(() => null)) as { verdict?: string; confidence?: string } | null;
  const verdict = VERDICTS.find((v) => v === b?.verdict);
  const confidence = CONFIDENCES.find((c) => c === b?.confidence);
  if (!verdict || !confidence) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const key = `scan:fb:${confidence}:${verdict}`;
  await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rows = await prisma.counter.findMany({ where: { key: { startsWith: "scan:fb:" } }, take: 20 });
  // The click-out funnel, by UTC day (DECISIONS.md 2026-11-19 "Complete my set after a scan"): scan sessions, and how
  // many of them clicked out, priced a basket or added to the cart.
  const days = Array.from({ length: 21 }, (_, i) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  const fkeys = days.flatMap((d) => ["sess", "out", "basket", "cart"].map((k) => `scan:${k}:${d}`));
  const frows = await prisma.counter.findMany({ where: { key: { in: fkeys } }, select: { key: true, value: true } });
  const fv = new Map(frows.map((r) => [r.key, r.value]));
  const funnel = days.map((d) => ({ day: d, sessions: fv.get(`scan:sess:${d}`) ?? 0, out: fv.get(`scan:out:${d}`) ?? 0, basket: fv.get(`scan:basket:${d}`) ?? 0, cart: fv.get(`scan:cart:${d}`) ?? 0 }));
  return NextResponse.json({ tally: Object.fromEntries(rows.map((r) => [r.key.slice(8), r.value])), funnel }, { headers: { "Cache-Control": "private, no-store" } });
}
