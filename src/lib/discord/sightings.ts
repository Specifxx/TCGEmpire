// The hub's #restock-sightings forum (owner, 2026-11-26: OzBargain report move 7, a three-week test). Members post
// restocks they saw; this turns the forum's threads into the counts the Discord agent's Monday self-review reads:
// sightings, distinct posters, replies, 🔥 reactions, sold-out marks, and the split by game and region tag.
// Pure, so it is tested without Discord. Counts only: never a title, a name or anything a member wrote.

export const SIGHTINGS_FORUM = "1575416782443913308";
export const SIGHTINGS_LAUNCH = Date.parse("2026-11-26T07:50:00Z");

export type ForumTag = { id: string; name: string; moderated?: boolean };
export type ForumThread = {
  id: string;
  parent_id?: string;
  owner_id?: string;
  message_count?: number;
  applied_tags?: string[];
  thread_metadata?: { create_timestamp?: string };
  fire?: number; // 🔥 reactions on the starter message, filled in by the script
};

export type SightingsSummary = {
  sightings: number;
  last7: number;
  posters: number;
  replies: number;
  fire: number;
  soldOut: number;
  byTag: Record<string, number>;
};

const SOLD_OUT = "sold out";

export function summariseSightings(threads: ForumThread[], tags: ForumTag[], now: number): SightingsSummary {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const posters = new Set<string>();
  const out: SightingsSummary = { sightings: 0, last7: 0, posters: 0, replies: 0, fire: 0, soldOut: 0, byTag: {} };
  for (const t of threads) {
    if (seen.has(t.id) || (t.parent_id && t.parent_id !== SIGHTINGS_FORUM)) continue;
    seen.add(t.id);
    const applied = (t.applied_tags ?? []).map((id) => byId.get(id)).filter((x): x is ForumTag => Boolean(x));
    // Our own pinned how-to carries a moderator-only tag; it is not a sighting.
    if (applied.some((x) => x.moderated)) continue;
    const created = Date.parse(t.thread_metadata?.create_timestamp ?? "");
    if (Number.isFinite(created) && created < SIGHTINGS_LAUNCH) continue;
    out.sightings++;
    if (Number.isFinite(created) && now - created <= 7 * 86_400_000) out.last7++;
    if (t.owner_id) posters.add(t.owner_id);
    out.replies += t.message_count ?? 0; // Discord counts replies only, not the starter post
    out.fire += t.fire ?? 0;
    for (const x of applied) {
      if (x.name.toLowerCase() === SOLD_OUT) out.soldOut++;
      else out.byTag[x.name] = (out.byTag[x.name] ?? 0) + 1;
    }
  }
  out.posters = posters.size;
  return out;
}

export function sightingsLines(s: SightingsSummary): string[] {
  const tags = Object.entries(s.byTag).sort((a, z) => z[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  return [
    `Restock sightings: ${s.sightings} (${s.last7} in 7 days) from ${s.posters} members; ${s.replies} replies, ${s.fire} fire, ${s.soldOut} marked sold out`,
    ...(tags ? [`  by tag: ${tags}`] : []),
  ];
}
