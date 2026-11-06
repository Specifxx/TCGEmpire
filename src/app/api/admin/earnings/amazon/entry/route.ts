import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { forgetEarnings } from "@/lib/earnings/sources";
import { AMAZON_STORES, allocateAmazonEntry, amazonTag, parseAmazonEntry } from "@/lib/earnings/amazon";
import { liveRoute } from "@/lib/public-data/live-route";

export const dynamic = "force-dynamic";

// Amazon Associates figures typed in from the screen (2026-11-06; the format and
// the allocation are in lib/earnings/amazon.ts). POST JSON { text, key? } or a
// text/plain body: one block per store, "store:" / "range:" / "day …" / "id …"
// lines. Each store block REPLACES that store's Amazon days in its range, like an
// upload, so Claude in Chrome can re-enter a range safely. Same gate as the
// upload: a signed-in admin, or ADMIN_TOKEN.
const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 10_000;

async function allowed(key: unknown): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  if (token && key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

async function handlePOST(req: Request) {
  let text = "";
  let key: unknown = null;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    text = typeof body?.text === "string" ? body.text : "";
    key = body?.key;
  } else {
    text = await req.text().catch(() => "");
    key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  }
  if (!(await allowed(key))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "That is too much text; enter 90 days at a time" }, { status: 400 });

  let stores;
  try {
    stores = parseAmazonEntry(text);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't read that" }, { status: 400 });
  }
  const saved: { store: string; from: string; to: string; days: number; trackingIds: number; items: number; cents: number; currency: string }[] = [];
  for (const e of stores) {
    const store = AMAZON_STORES.find((s) => s.key === e.key)!;
    const rows = allocateAmazonEntry(e);
    if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Store ${e.key}: too many rows; enter 90 days at a time` }, { status: 400 });
    const { from, to } = e;
    const note = `${store.label} typed from the screen, ${from} to ${to}`;
    await prisma.$transaction([
      prisma.manualEarning.deleteMany({ where: { source: "amazon", currency: store.currency, day: { gte: from, lte: to } } }),
      prisma.manualEarning.createMany({
        data: [
          // The coverage marker: how far this store's figures reach, even a range with no sales.
          { source: "amazon", day: to, amountCents: 0, currency: store.currency, tag: "", units: 0, note },
          ...rows.map((r) => ({ source: "amazon", day: r.day, amountCents: r.cents, currency: store.currency, tag: amazonTag(r.trackingId, store.key), units: r.items, note })),
        ],
      }),
    ]);
    saved.push({
      store: store.key,
      from,
      to,
      days: new Set(rows.map((r) => r.day)).size,
      trackingIds: e.ids.length,
      items: rows.reduce((n, r) => n + r.items, 0),
      cents: rows.reduce((n, r) => n + r.cents, 0),
      currency: store.currency,
    });
  }
  forgetEarnings("amazon");
  return NextResponse.json({ ok: true, saved });
}

export const POST = liveRoute(handlePOST);
