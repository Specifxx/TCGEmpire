import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forgetEarnings } from "@/lib/earnings/sources";
import { amazonStore, amazonTag, parseAmazonEarnings, unzipFirst } from "@/lib/earnings/amazon";
import { liveRoute } from "@/lib/public-data/live-route";

export const dynamic = "force-dynamic";

// Amazon Associates earnings for /admin/earnings (2026-11-03; lib/earnings/amazon.ts
// says why there is no API). POST multipart { store, file } — the Earnings report
// from Associates Central, as Amazon's ZIP or the CSV/TSV inside — REPLACES that
// store's Amazon days in the range the report covers, so an upload can be repeated
// safely. DELETE { store } clears one store. Same gate as the manual entries: a
// signed-in admin, or ADMIN_TOKEN.
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 10_000;

async function allowed(key: unknown): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (token && key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

async function handlePOST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form || !(await allowed(form.get("key")))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const store = amazonStore(String(form.get("store") ?? ""));
  if (!store) return NextResponse.json({ error: "Pick which Amazon store the report is from" }, { status: 400 });
  const file = form.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose the report file" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 8 MB; download a shorter date range" }, { status: 400 });

  let upload;
  try {
    const raw = Buffer.from(await file.arrayBuffer());
    const text = (unzipFirst(raw) ?? raw).toString("utf8");
    // The US account writes 10/14/2026; the others 14/10/2026.
    upload = parseAmazonEarnings(text, store.key !== "us");
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read that file" }, { status: 400 });
  }
  if (upload.rows.length > MAX_ROWS) return NextResponse.json({ error: "That report is too long; download a shorter date range" }, { status: 400 });

  const { from, to, rows } = upload;
  const note = `${store.label} report ${from} to ${to}`;
  await prisma.$transaction([
    prisma.manualEarning.deleteMany({ where: { source: "amazon", currency: store.currency, day: { gte: from, lte: to } } }),
    prisma.manualEarning.createMany({
      data: [
        // The coverage marker: how far this store's figures reach, even a week with no sales.
        { source: "amazon", day: to, amountCents: 0, currency: store.currency, tag: "", units: 0, note },
        ...rows.map((r) => ({ source: "amazon", day: r.day, amountCents: r.cents, currency: store.currency, tag: amazonTag(r.trackingId, store.key), units: r.items, note })),
      ],
    }),
  ]);
  forgetEarnings("amazon");
  const cents = rows.reduce((n, r) => n + r.cents, 0);
  return NextResponse.json({ ok: true, store: store.key, from, to, days: new Set(rows.map((r) => r.day)).size, trackingIds: new Set(rows.map((r) => r.trackingId)).size, items: upload.items, cents, currency: store.currency });
}

async function handleDELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!(await allowed(body?.key))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const store = amazonStore(String(body?.store ?? ""));
  if (!store) return NextResponse.json({ error: "Unknown store" }, { status: 400 });
  const { count } = await prisma.manualEarning.deleteMany({ where: { source: "amazon", currency: store.currency } });
  forgetEarnings("amazon");
  return NextResponse.json({ ok: true, removed: count });
}

export const POST = liveRoute(handlePOST);
export const DELETE = liveRoute(handleDELETE);
