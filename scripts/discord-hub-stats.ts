// The Discord hub's numbers for the Discord agent's weekly self-review (DECISIONS.md 2026-11-21): members (from the public
// invite, no key) and, when the bot may manage the server, each tracked invite's uses, so we know which site sends people.
// Prints counts only, to the log and the job summary. Never fails the run.
import fs from "node:fs";
import { SIGHTINGS_FORUM, sightingsLines, summariseSightings, type ForumTag, type ForumThread } from "../src/lib/discord/sightings";

const GUILD = "1564578153534591006";
const HUB_INVITE = "cdJEpmuTW2";
export const INVITE_SOURCES: Record<string, string> = {
  n6nc7EQH2D: "DexCompare",
  s8YRcSgxRy: "TCG Prices",
  "5pdA3QVPBS": "RiftCompare",
  zkUVnPbaHD: "OP Compare",
  "6pTeNX8Y5k": "MTG Compare",
  Dg4qYhAV7X: "YGO Compare",
  SRrMNdKbDp: "Lorcana Compare",
  cdJEpmuTW2: "Singles DB / emails / other",
  Rj4zzzay2V: "Cyberpunk Compare",
  cmN2J9hCRQ: "Gundam Compare",
};

async function get(url: string, token?: string): Promise<{ status: number; body: unknown }> {
  const r = await fetch(url, { headers: token ? { authorization: `Bot ${token}` } : {}, signal: AbortSignal.timeout(10_000) });
  return { status: r.status, body: r.ok ? await r.json() : null };
}

// The #restock-sightings test (owner, 2026-11-26; lib/discord/sightings.ts): the forum's tags, its live and archived
// threads, and the 🔥 count on each starter post (at most 100 threads, once a day).
async function sightings(token: string): Promise<string[]> {
  const forum = await get(`https://discord.com/api/v10/channels/${SIGHTINGS_FORUM}`, token);
  const tags = ((forum.body as { available_tags?: ForumTag[] } | null)?.available_tags ?? []) as ForumTag[];
  if (!forum.body) return [`Restock sightings: forum not readable (HTTP ${forum.status})`];
  const active = await get(`https://discord.com/api/v10/guilds/${GUILD}/threads/active`, token);
  const archived = await get(`https://discord.com/api/v10/channels/${SIGHTINGS_FORUM}/threads/archived/public?limit=100`, token);
  const threads = [
    ...(((active.body as { threads?: ForumThread[] } | null)?.threads ?? []).filter((t) => t.parent_id === SIGHTINGS_FORUM)),
    ...((archived.body as { threads?: ForumThread[] } | null)?.threads ?? []),
  ].slice(0, 100);
  for (const t of threads) {
    const m = await get(`https://discord.com/api/v10/channels/${t.id}/messages/${t.id}`, token).catch(() => ({ status: 0, body: null }));
    const r = (m.body as { reactions?: { emoji: { name: string }; count: number }[] } | null)?.reactions ?? [];
    t.fire = r.find((x) => x.emoji.name === "🔥")?.count ?? 0;
  }
  return sightingsLines(summariseSightings(threads, tags, Date.now()));
}

async function main() {
  const lines: string[] = [];
  const pub = await get(`https://discord.com/api/v10/invites/${HUB_INVITE}?with_counts=true`).catch(() => ({ status: 0, body: null }));
  const b = pub.body as { approximate_member_count?: number; approximate_presence_count?: number } | null;
  lines.push(b ? `Members: ${b.approximate_member_count} (${b.approximate_presence_count} online)` : `Members: unknown (HTTP ${pub.status})`);
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) lines.push("Invite uses: no bot token.");
  else {
    const inv = await get(`https://discord.com/api/v10/guilds/${GUILD}/invites`, token).catch(() => ({ status: 0, body: null }));
    if (!Array.isArray(inv.body)) lines.push(`Invite uses: not readable (HTTP ${inv.status}; the bot needs Manage Server in the hub).`);
    else {
      const rows = (inv.body as { code: string; uses: number }[]).map((i) => ({ src: INVITE_SOURCES[i.code] ?? `other (${i.code})`, uses: i.uses }));
      rows.sort((a, z) => z.uses - a.uses);
      lines.push("Invite uses:", ...rows.map((r) => `  ${r.uses}\t${r.src}`));
    }
    lines.push(...(await sightings(token).catch((e) => [`Restock sightings: not readable (${(e as Error).message})`])));
  }
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + lines.join("\n") + "\n```\n");
}

main().catch((e) => console.error("[discord-hub-stats]", (e as Error).message));
