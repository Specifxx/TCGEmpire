import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forgetEarnings } from "@/lib/earnings/sources";
import { liveRoute } from "@/lib/public-data/live-route";

export const dynamic = "force-dynamic";

// Earnings typed in on /admin/earnings for a source with no API (Mediavine).
// POST { day, amount, currency?, note? } adds one entry; DELETE { id } removes one.
// Same dual gate as every other admin mutation: a signed-in admin, or ADMIN_TOKEN.
const SOURCES = new Set(["mediavine"]);
const CURRENCIES = new Set(["USD", "AUD", "GBP", "EUR", "CAD", "SGD"]);

async function allowed(body: { key?: unknown } | null): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (token && body?.key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!(await allowed(body))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const source = String(body?.source ?? "mediavine");
  const day = String(body?.day ?? "");
  const amount = Number(body?.amount);
  const currency = String(body?.currency ?? "USD").toUpperCase();
  if (!SOURCES.has(source)) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000) return NextResponse.json({ error: "Enter an amount" }, { status: 400 });
  if (!CURRENCIES.has(currency)) return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) || null : null;
  const row = await prisma.manualEarning.create({
    data: { source, day, amountCents: Math.round(amount * 100), currency, note },
    select: { id: true },
  });
  forgetEarnings("mediavine");
  return NextResponse.json({ ok: true, id: row.id });
}

async function handleDELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!(await allowed(body))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.manualEarning.delete({ where: { id } }).catch(() => null);
  forgetEarnings("mediavine");
  return NextResponse.json({ ok: true });
}

export const POST = liveRoute(handlePOST);
export const DELETE = liveRoute(handleDELETE);
