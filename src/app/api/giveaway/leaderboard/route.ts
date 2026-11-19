import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-emails";
import { CURRENT_GIVEAWAY as G, publicName } from "@/lib/giveaway";
import { giveawayEntrants } from "@/lib/giveaway-server";

// The public leaderboard on /giveaway (owner, 2026-11-19: "a leaderboard ... everyone who's entered ... the top
// 100"). One query set every six hours, held by the CDN (the site's floor for route handlers); reads no cookie.
// Shows only a short public name (lib/giveaway.ts publicName) or "Anonymous entrant", never an email or an id.
// The site's own team is left out, as the rules leave it out of the draw.
export const revalidate = 21600;

export async function GET() {
  let rows: { name: string; entries: number }[] = [];
  let entrants = 0;
  let entries = 0;
  try {
    const all = (await giveawayEntrants(G, isAdminEmail)).filter((e) => !e.admin);
    entrants = all.length;
    entries = all.reduce((s, e) => s + e.weight, 0);
    rows = [...all]
      .sort((a, b) => b.weight - a.weight || a.enteredAt.getTime() - b.enteredAt.getTime())
      .slice(0, 100)
      .map((e) => ({ name: publicName(e.name, e.showName), entries: e.weight }));
  } catch (e) {
    console.error("[giveaway] leaderboard failed:", e);
  }
  return NextResponse.json(
    { giveaway: G.key, entrants, entries, top: rows, at: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200" } },
  );
}
