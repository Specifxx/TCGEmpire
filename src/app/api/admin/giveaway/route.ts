import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isGiveawayTeamEmail } from "@/lib/admin-emails";
import { SITE_URL } from "@/lib/site";
import { prisma } from "@/lib/db";
import { CURRENT_GIVEAWAY, giveawayByKey, giveawayState } from "@/lib/giveaway";
import { giveawayEntrants } from "@/lib/giveaway-server";
import { runGiveawayDraws } from "@/lib/giveaway-run";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

// GET ?giveaway=<key>: every entrant as CSV (admin only). Holds account emails, so it is private, uncached and
// never linked from a public page.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const key = new URL(req.url).searchParams.get("giveaway");
  const g = key ? giveawayByKey(key) : CURRENT_GIVEAWAY;
  if (!g) return NextResponse.json({ error: "No such giveaway" }, { status: 404, headers: noStore });
  const rows = await giveawayEntrants(g, isGiveawayTeamEmail);
  const esc = (v: string | number | boolean | null) => {
    const s = v == null ? "" : String(v);
    // Quote every cell, and defuse spreadsheet formulas in user-written names.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const lines = [
    ["name", "email", "country", "entered_at_utc", "points", "bonus_via", "checkins", "confirmed_referrals", "entered_from", "shows_name", "team_excluded"]
      .map(esc)
      .join(","),
    ...rows.map((r) =>
      [r.name, r.email, r.country, r.enteredAt.toISOString(), r.weight, r.reason, r.checkins, r.referrals, r.site ?? "rift", r.showName, r.admin]
        .map(esc)
        .join(","),
    ),
  ];
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      ...noStore,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${g.key}-entrants.csv"`,
    },
  });
}

// POST { giveaway, action }: admin only, same origin.
//   draw:    run the published drand draw for that giveaway now (lib/giveaway-run.ts; the same thing the six-hourly cron does,
//            so it never draws twice: a pending winner inside the claim window is left alone).
//   shipped: mark the claimed prize as posted (the public trophy then says so).
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_URL) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: noStore });
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Not authorised" }, { status: 404, headers: noStore });
  const body = (await req.json().catch(() => null)) as { giveaway?: unknown; action?: unknown } | null;
  const g = typeof body?.giveaway === "string" ? giveawayByKey(body.giveaway) : null;
  if (!g) return NextResponse.json({ error: "No such giveaway" }, { status: 404, headers: noStore });
  if (body?.action === "draw") {
    if (giveawayState(g, new Date()) !== "closed") return NextResponse.json({ error: "Draw only after entries close." }, { status: 409, headers: noStore });
    const [line] = await runGiveawayDraws({ list: [g] });
    console.info(`[giveaway] ${g.key} draw run by ${user.id}: ${line?.did}`);
    return NextResponse.json({ ok: true, ...line }, { headers: noStore });
  }
  if (body?.action === "shipped") {
    const draw = await prisma.giveawayDraw.findFirst({ where: { giveaway: g.key, status: "claimed" }, orderBy: { attempt: "desc" } });
    if (!draw) return NextResponse.json({ error: "No claimed prize to mark." }, { status: 409, headers: noStore });
    await prisma.giveawayDraw.update({ where: { id: draw.id }, data: { status: "shipped", shippedAt: new Date() } });
    console.info(`[giveaway] ${g.key} marked shipped by ${user.id}`);
    return NextResponse.json({ ok: true, did: "shipped" }, { headers: noStore });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400, headers: noStore });
}
