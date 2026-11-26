import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPullSetCards } from "@/lib/pull-tracker-server";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { MAX_LOGS_PER_DAY, MAX_PACKS_PER_MEMBER_SET, parsePullLog, pullRateSetByCode, pullRateSetBySlug } from "@/lib/pull-rates";
import { utcDay } from "@/lib/scan/caps";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

// COMMUNITY PULL RATES (lib/pull-rates.ts has the rules; DECISIONS.md 2026-11-26).
//
// POST { set, packs, hits: [{ cardId, qty }], source }: a signed-in member's packs and every Epic and
//   Showcase in them. Checked against the set's own card list; at most MAX_LOGS_PER_DAY a member a UTC
//   day and MAX_PACKS_PER_MEMBER_SET packs a member per set. Saved, then the owner hears about the first
//   log and every 50th (never one email a log).
// GET: the member's own logs (newest 20), so they can see and take back what they added.
// DELETE ?id=: removes one of the member's own logs. Nothing here is public: pages read only the
//   grouped tally (lib/pull-rates-server.ts).

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: NO_STORE });
  const logs = await prisma.pullLog
    .findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, setCode: true, packs: true, createdAt: true, _count: { select: { hits: true } } },
    })
    .catch(() => []);
  return NextResponse.json(
    { logs: logs.map((l) => ({ id: l.id, set: pullRateSetByCode(l.setCode)?.slug ?? l.setCode, packs: l.packs, cards: l._count.hits, at: l.createdAt.toISOString() })) },
    { headers: NO_STORE },
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to add your pulls: it's free." }, { status: 401, headers: NO_STORE });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const set = typeof body?.set === "string" ? pullRateSetBySlug(body.set) ?? pullRateSetByCode(body.set) : undefined;
  if (!set) return NextResponse.json({ error: "Pick the set you opened." }, { status: 400, headers: NO_STORE });

  const cards = (await getPullSetCards(set.code)).map((c) => ({ id: c.id, setCode: set.code, rarity: c.rarity, collectorNumber: c.collectorNumber }));
  const parsed = parsePullLog(body, cards);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE });
  const log = parsed.log;

  // The member's day cap (a guarded Counter increment), then their per-set pack ceiling.
  const dayKey = `pulls:u:${user.id}:${utcDay()}`;
  const day = await prisma.counter.upsert({ where: { key: dayKey }, create: { key: dayKey, value: 1 }, update: { value: { increment: 1 } } });
  if (day.value > MAX_LOGS_PER_DAY) {
    return NextResponse.json({ error: `That's ${MAX_LOGS_PER_DAY} logs today. Add the rest tomorrow.` }, { status: 429, headers: NO_STORE });
  }
  const mine = await prisma.pullLog.aggregate({ where: { userId: user.id, setCode: log.setCode }, _sum: { packs: true } });
  if ((mine._sum.packs ?? 0) + log.packs > MAX_PACKS_PER_MEMBER_SET) {
    await prisma.counter.update({ where: { key: dayKey }, data: { value: { decrement: 1 } } }).catch(() => {});
    return NextResponse.json({ error: `One member can add up to ${MAX_PACKS_PER_MEMBER_SET} ${set.name} packs, so no single opener outweighs everyone else.` }, { status: 400, headers: NO_STORE });
  }

  const saved = await prisma.pullLog.create({
    data: {
      userId: user.id,
      setCode: log.setCode,
      packs: log.packs,
      source: log.source,
      hits: { create: log.hits.map((h) => ({ setCode: log.setCode, cardId: h.cardId, tier: h.tier, qty: h.qty })) },
    },
    select: { id: true },
  });

  const total = await prisma.counter.upsert({ where: { key: "pulls:logs" }, create: { key: "pulls:logs", value: 1 }, update: { value: { increment: 1 } } }).catch(() => null);
  if (total && (total.value === 1 || total.value % 50 === 0)) {
    await notifyOwnerBounded({
      kind: "pull-log",
      headline: total.value === 1 ? "The first community pull log is in" : `${total.value} community pull logs`,
      fields: [
        ["Latest", `${set.name}, ${log.packs} pack${log.packs === 1 ? "" : "s"}, ${log.hits.length} hit line${log.hits.length === 1 ? "" : "s"}`],
        ["Page", `/pull-rates/${set.slug}`],
      ],
    });
  }
  return NextResponse.json({ ok: true, id: saved.id }, { headers: NO_STORE });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: NO_STORE });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id || id.length > 40) return NextResponse.json({ error: "Which log?" }, { status: 400, headers: NO_STORE });
  const r = await prisma.pullLog.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: r.count > 0 }, { status: r.count ? 200 : 404, headers: NO_STORE });
}
