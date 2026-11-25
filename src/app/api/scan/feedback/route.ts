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
  return NextResponse.json({ tally: Object.fromEntries(rows.map((r) => [r.key.slice(8), r.value])) }, { headers: { "Cache-Control": "private, no-store" } });
}
