import { NextResponse } from "next/server";
import { isGiveawayTeamEmail } from "@/lib/admin-emails";
import { CURRENT_GIVEAWAY, GIVEAWAY_SITES, giveawayFor, giveawayState, type GiveawaySite } from "@/lib/giveaway";
import { latestWinner, publicBoard } from "@/lib/giveaway-server";

// The public view of a site's giveaway (owner, 2026-11-19: "a leaderboard ... the top 100"; 2026-11-22: the winner's "trophy
// banner ... the winning number"): ?site=rift|dex|mtg|ygo|op. Counts, the top 100 by points (a short public name or "Anonymous
// entrant", never an email or an id; the team left out) and, once drawn, the winner's public name, ticket and drand round.
// Held six hours by the CDN (the site's floor for route handlers); reads no cookie. Any origin may read it: it is public.
export const revalidate = 21600;

const SITES = Object.keys(GIVEAWAY_SITES) as GiveawaySite[];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("site");
  const site = (SITES as string[]).includes(q ?? "") ? (q as GiveawaySite) : "rift";
  const g = site === "rift" ? CURRENT_GIVEAWAY : giveawayFor(site, new Date());
  const headers = {
    "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200",
    "Access-Control-Allow-Origin": "*",
  };
  if (!g) return NextResponse.json({ giveaway: null }, { headers });
  let board = { entrants: 0, points: 0, top: [] as { name: string; points: number }[] };
  let winner = null;
  try {
    [board, winner] = await Promise.all([publicBoard(g, isGiveawayTeamEmail), latestWinner(g.key)]);
  } catch (e) {
    console.error("[giveaway] leaderboard failed:", e);
  }
  return NextResponse.json(
    {
      giveaway: g.key,
      state: giveawayState(g, new Date()),
      closesAt: g.closesAt,
      entrants: board.entrants,
      // Old readers (the Rift page before 2026-11-22) read "entries".
      entries: board.points,
      points: board.points,
      top: board.top.map((t) => ({ ...t, entries: t.points })),
      winner,
      at: new Date().toISOString(),
    },
    { headers },
  );
}
