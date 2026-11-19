import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin-emails";
import { SITE_URL } from "@/lib/site";
import { CURRENT_GIVEAWAY, giveawayByKey, giveawayState, weightedPick } from "@/lib/giveaway";
import { giveawayEntrants } from "@/lib/giveaway-server";

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
  const rows = await giveawayEntrants(g, isAdminEmail);
  const esc = (v: string | number | boolean | null) => {
    const s = v == null ? "" : String(v);
    // Quote every cell, and defuse spreadsheet formulas in user-written names.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const lines = [
    ["name", "email", "country", "entered_at_utc", "entries", "why", "confirmed_referrals", "shows_name", "team_excluded"].map(esc).join(","),
    ...rows.map((r) =>
      [r.name, r.email, r.country, r.enteredAt.toISOString(), r.weight, r.reason, r.referrals, r.showName, r.admin].map(esc).join(","),
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

// POST: draw the winner (admin only, same origin). Each valid entrant's chance is their entries over the total
// (lib/giveaway.ts weightedPick, crypto.randomInt), the team left out. Returns the winner's account email so the
// owner can write to them. Nothing is stored or sent: running it twice is a fresh draw, so run it once, on the draw
// date, and note the result.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_URL) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: noStore });
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Not authorised" }, { status: 404, headers: noStore });
  const body = (await req.json().catch(() => null)) as { giveaway?: unknown; exclude?: unknown } | null;
  const g = typeof body?.giveaway === "string" ? giveawayByKey(body.giveaway) : CURRENT_GIVEAWAY;
  if (!g) return NextResponse.json({ error: "No such giveaway" }, { status: 404, headers: noStore });
  if (giveawayState(g, new Date()) !== "closed") return NextResponse.json({ error: "Draw only after entries close." }, { status: 409, headers: noStore });
  // A redraw (winner didn't claim) passes the earlier winner's email to leave out.
  const exclude = typeof body?.exclude === "string" ? body.exclude.toLowerCase().trim().slice(0, 200) : null;
  const pool = (await giveawayEntrants(g, isAdminEmail)).filter((e) => !e.admin && e.email.toLowerCase() !== exclude);
  const winner = weightedPick(pool, (n) => randomInt(n));
  if (!winner) return NextResponse.json({ error: "No valid entries." }, { status: 404, headers: noStore });
  const total = pool.reduce((s, e) => s + e.weight, 0);
  console.info(`[giveaway] ${g.key} drawn by ${user.id} from ${pool.length} entrants, ${total} entries`);
  return NextResponse.json(
    { giveaway: g.key, entrants: pool.length, entries: total, winnerEmail: winner.email, winnerName: winner.name, winnerEntries: winner.weight },
    { headers: noStore },
  );
}
