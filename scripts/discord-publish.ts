// Publishes the Sealed Sniper's drops in the hub's #sealed-sniper announcement channel (DECISIONS.md 2026-11-23), so every
// server that FOLLOWS that channel gets them in its own channel: the free deals feed for partner servers, with no webhook or
// key of theirs to hold. A webhook cannot publish, so the price bot (Manage Messages in the hub) does it after each run.
// Publishes only webhook messages of the last day that are not yet published; never fails the run.
const CHANNEL = "1573082997203275887"; // #sealed-sniper in TCG Deals & Restocks
const CROSSPOSTED = 1;
const DAY = 86_400_000;

interface Msg {
  id: string;
  timestamp: string;
  flags?: number;
  webhook_id?: string;
}

export function toPublish(msgs: readonly Msg[], now: number): string[] {
  return msgs
    .filter((m) => m.webhook_id && !((m.flags ?? 0) & CROSSPOSTED) && now - Date.parse(m.timestamp) < DAY)
    .map((m) => m.id)
    .reverse(); // oldest first, as they were posted
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return console.log("publish: no bot token, nothing done.");
  const h = { authorization: `Bot ${token}` };
  const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages?limit=10`, { headers: h, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return console.log(`publish: could not read the channel (HTTP ${r.status}).`);
  const ids = toPublish((await r.json()) as Msg[], Date.now());
  let ok = 0;
  for (const id of ids) {
    const p = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages/${id}/crosspost`, { method: "POST", headers: h, signal: AbortSignal.timeout(10_000) });
    if (p.ok) ok++;
    else console.log(`publish: ${id} answered HTTP ${p.status}`);
  }
  console.log(`publish: ${ok} of ${ids.length} drop(s) published to following servers.`);
}

if (process.argv[1]?.endsWith("discord-publish.ts")) main().catch((e) => console.log(`publish: ${e instanceof Error ? e.message : e}`));
