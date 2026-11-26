import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import type { Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { premiumCors, premiumSiteForOrigin, premiumStatusFor, verifyPremiumSession } from "@/lib/sister-premium";
import { parseStashItems, STASH_SITES } from "@/lib/sister-stash";

export const dynamic = "force-dynamic";

// A signed-in member's collection on a sister site (lib/sister-stash.ts). Token-authenticated (lib/sister-premium.ts), scoped
// to the token's address and the calling site; open to every signed-in account, Premium or not.
//   { token, op: "get" }                         → { ok, rev, items, weekly, lastSentAt }
//   { token, op: "put", baseRev, items }         → { ok, rev } | 409 { conflict: true, rev, items } when baseRev is stale
//   { token, op: "weekly", on }                  → { ok, weekly }   (the weekly email, to the account's own address)
const MAX_BODY = 400_000;

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

type Row = { items: unknown; rev: number; weekly: boolean; lastSentAt: Date | null };
const view = (r: Row | null) => ({ rev: r?.rev ?? 0, items: parseStashItems(r?.items ?? []), weekly: r?.weekly ?? false, lastSentAt: r?.lastSentAt ? r.lastSentAt.toISOString() : null });
const SELECT = { items: true, rev: true, weekly: true, lastSentAt: true } as const;

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  if (!site || !STASH_SITES.has(site.key)) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const rl = rateLimit(`sister-stash:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfter) } });
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "That list is too big." }, { status: 413, headers });
  let body: { token?: unknown; op?: unknown; baseRev?: unknown; items?: unknown; on?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const email = await verifyPremiumSession(body?.token, site);
  if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  const where = { email_site: { email, site: site.key } };

  try {
    const status = await premiumStatusFor(email);
    if (!status) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });

    if (body?.op === "get") {
      const row = await prisma.sisterStash.findUnique({ where, select: SELECT });
      return NextResponse.json({ ok: true, ...view(row) }, { headers });
    }

    if (body?.op === "put") {
      const baseRev = Number(body.baseRev);
      if (!Number.isInteger(baseRev) || baseRev < 0) return NextResponse.json({ error: "Bad revision" }, { status: 400, headers });
      const items = parseStashItems(body.items) as unknown as PrismaNS.InputJsonArray;
      const conflict = async () => NextResponse.json({ ok: false, conflict: true, ...view(await prisma.sisterStash.findUnique({ where, select: SELECT })) }, { status: 409, headers });
      // Compare-and-set on the revision: a write built on an older list changes nothing.
      const res = await prisma.sisterStash.updateMany({ where: { email, site: site.key, rev: baseRev }, data: { items, rev: { increment: 1 } } });
      if (res.count !== 1) {
        if (baseRev !== 0) return conflict();
        // The first save: create, unless another device got there first.
        try {
          await prisma.sisterStash.create({ data: { email, site: site.key, items, rev: 1 } });
        } catch (e) {
          if ((e as { code?: string }).code === "P2002") return conflict();
          throw e;
        }
      }
      return NextResponse.json({ ok: true, rev: baseRev + 1 }, { headers });
    }

    if (body?.op === "weekly") {
      const on = body.on === true;
      if (on) {
        // The weekly email goes to the account's own address, which signing in proved. Mark it confirmed for the shared alert
        // service, whose manage page and one-click unsubscribe the email links to.
        if (!status.verified) return NextResponse.json({ error: "Confirm your email address first, then turn this on." }, { status: 409, headers });
        const addr = await prisma.sisterAlertAddress.findUnique({ where: { email }, select: { confirmedAt: true } });
        if (!addr) await prisma.sisterAlertAddress.create({ data: { email, token: randomBytes(24).toString("base64url"), confirmedAt: new Date() } });
        else if (!addr.confirmedAt) await prisma.sisterAlertAddress.update({ where: { email }, data: { confirmedAt: new Date() } });
      }
      await prisma.sisterStash.upsert({
        where,
        create: { email, site: site.key, items: [], rev: 0, weekly: on, weeklyAt: on ? new Date() : null },
        update: { weekly: on, ...(on ? { weeklyAt: new Date() } : {}) },
      });
      return NextResponse.json({ ok: true, weekly: on }, { headers });
    }

    return NextResponse.json({ error: "Unknown request" }, { status: 400, headers });
  } catch (e) {
    console.warn("[sister-stash] failed:", e);
    return NextResponse.json({ error: "Couldn't reach your collection. Try again." }, { status: 503, headers });
  }
}
