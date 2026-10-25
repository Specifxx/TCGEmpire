import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { COST_CATEGORIES } from "@/lib/earnings/core";
import { liveRoute } from "@/lib/public-data/live-route";

export const dynamic = "force-dynamic";

// Cost entries on /admin/earnings (lib/earnings/costs.ts).
//   POST   { label, category, amount, currency, startDay, recurrence, endDay?, note? }  add one
//   PATCH  { id, endDay }   stop a repeating cost (or move its end); endDay null restarts it
//   DELETE { id }           remove (kept as removedAt, so a pre-filled entry is not re-added)
// Same dual gate as every other admin mutation: a signed-in admin, or ADMIN_TOKEN.
const CURRENCIES = new Set(["USD", "AUD", "GBP", "EUR", "CAD", "SGD"]);
const RECURRENCES = new Set(["once", "monthly", "yearly"]);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

async function allowed(body: { key?: unknown } | null): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (token && body?.key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

async function read(req: Request): Promise<Record<string, unknown> | null> {
  return (await req.json().catch(() => null)) as Record<string, unknown> | null;
}

async function handlePOST(req: Request) {
  const body = await read(req);
  if (!(await allowed(body))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const label = String(body?.label ?? "").trim().slice(0, 80);
  const category = (COST_CATEGORIES as readonly string[]).includes(String(body?.category)) ? String(body!.category) : "Other";
  const amount = Number(body?.amount);
  const currency = String(body?.currency ?? "USD").toUpperCase();
  const recurrence = String(body?.recurrence ?? "once");
  const endDay = body?.endDay ? body.endDay : null;
  if (!label) return NextResponse.json({ error: "Name the cost" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return NextResponse.json({ error: "Enter an amount" }, { status: 400 });
  if (!CURRENCIES.has(currency)) return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  if (!RECURRENCES.has(recurrence)) return NextResponse.json({ error: "Pick how often it repeats" }, { status: 400 });
  if (!isDay(body?.startDay)) return NextResponse.json({ error: "Pick a start date" }, { status: 400 });
  if (endDay !== null && (!isDay(endDay) || endDay < (body!.startDay as string))) return NextResponse.json({ error: "The end date must be after the start" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) || null : null;
  const row = await prisma.manualCost.create({
    data: { label, category, amountCents: Math.round(amount * 100), currency, startDay: body!.startDay as string, recurrence, endDay: endDay as string | null, note },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: row.id });
}

async function handlePATCH(req: Request) {
  const body = await read(req);
  if (!(await allowed(body))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = String(body?.id ?? "");
  const endDay = body?.endDay ?? null;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (endDay !== null && !isDay(endDay)) return NextResponse.json({ error: "Pick an end date" }, { status: 400 });
  const row = await prisma.manualCost.findUnique({ where: { id }, select: { startDay: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (endDay !== null && (endDay as string) < row.startDay) return NextResponse.json({ error: "The end date must be after the start" }, { status: 400 });
  await prisma.manualCost.update({ where: { id }, data: { endDay: endDay as string | null } });
  return NextResponse.json({ ok: true });
}

async function handleDELETE(req: Request) {
  const body = await read(req);
  if (!(await allowed(body))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await prisma.manualCost.update({ where: { id }, data: { removedAt: new Date() } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

export const POST = liveRoute(handlePOST);
export const PATCH = liveRoute(handlePATCH);
export const DELETE = liveRoute(handleDELETE);
