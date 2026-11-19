import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { utcDay } from "@/lib/scan/caps";

export const dynamic = "force-dynamic";

// POST /api/scan/out?k=out|basket|cart — the scanner's funnel (DECISIONS.md 2026-11-19 "Complete my set after a scan").
// The scan page sends each kind at most ONCE per visit: "out" on the first click to another site (any buy link on the
// page, the quick view's included), "basket" on the first "Price them all in one basket", "cart" on the first add to the
// cart list. With scan:sess (a visit's first successful scan, counted by /api/scan/identify) it answers "what share of
// scan sessions click out?" (target 8% by 4 Dec). Counts only: one Counter row per (kind, UTC day), no card, no user.
const KINDS = ["out", "basket", "cart"] as const;

export async function POST(req: Request) {
  const kind = KINDS.find((k) => k === new URL(req.url).searchParams.get("k"));
  if (!kind) return new NextResponse(null, { status: 400 });
  if (!(await getCurrentUser())) return new NextResponse(null, { status: 204 });
  const key = `scan:${kind}:${utcDay()}`;
  await prisma.counter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } }).catch(() => {});
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
