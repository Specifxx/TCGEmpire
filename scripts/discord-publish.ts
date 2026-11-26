// Publishes the Sealed Sniper's drops in the hub's #sealed-sniper announcement channel (DECISIONS.md 2026-11-23), so every
// server that FOLLOWS that channel gets them in its own channel: the free deals feed for partner servers, with no webhook or
// key of theirs to hold. A webhook cannot publish, so the price bot (Manage Messages in the hub) does it after each run.
// Publishes only webhook messages of the last day that are not yet published; never fails the run.
// Then copies each published drop's posts into its game's own channel (owner, 2026-11-23: cover every game), so a member
// who follows one game sees its deals there. Copies happen only right after a publish succeeds, so a drop is copied once.
// Each copy is published as well, so a partner server can follow ONE game's room (game-first rooms, 2026-11-26).
const CHANNEL = "1573082997203275887"; // #sealed-sniper in TCG Deals & Restocks
const CROSSPOSTED = 1;
const DAY = 86_400_000;

interface Embed {
  footer?: { text?: string };
  [k: string]: unknown;
}

interface Msg {
  id: string;
  timestamp: string;
  flags?: number;
  webhook_id?: string;
  embeds?: Embed[];
}

/** The hub's channel for each game the Sniper names in an embed footer ("Sealed Sniper · <game> · …"). */
export const GAME_CHANNEL: Record<string, string> = {
  "Pokémon": "1573095127163998399", // #pokemon
  "One Piece": "1573095173410390159", // #one-piece
  Riftbound: "1573095221007487037", // #riftbound
  Magic: "1573095266444251146", // #magic
  Lorcana: "1573095310010486855", // #lorcana
  "Yu-Gi-Oh!": "1573095354407190699", // #yugioh
};
/** Every other game the Sniper covers (Gundam, Union Arena, Fusion World, Digimon, Star Wars, FAB, Cyberpunk). */
export const OTHER_GAMES_CHANNEL = "1574350129824141353"; // #more-tcgs

/** The drop's embeds grouped by the channel of their game, in posting order. */
export function byGameChannel(embeds: readonly Embed[]): Map<string, { games: string[]; embeds: Embed[] }> {
  const out = new Map<string, { games: string[]; embeds: Embed[] }>();
  for (const e of embeds) {
    const game = e.footer?.text?.split(" · ")[1]?.trim();
    if (!game) continue;
    const ch = GAME_CHANNEL[game] ?? OTHER_GAMES_CHANNEL;
    const g = out.get(ch) ?? { games: [], embeds: [] };
    if (!g.games.includes(game)) g.games.push(game);
    g.embeds.push(e);
    out.set(ch, g);
  }
  return out;
}

/** The copy's message: a one-line head and the game's embeds, never a ping. */
export function copyMessage(g: { games: string[]; embeds: Embed[] }) {
  const n = g.embeds.length;
  return {
    content: `**Sealed Sniper:** ${n} ${g.games.join(" / ")} ${n === 1 ? "deal" : "deals"}, each checked at the store just before posting. All games: <#1573082997203275887>`,
    embeds: g.embeds.slice(0, 10),
    allowed_mentions: { parse: [] as never[] },
  };
}

export function toPublish(msgs: readonly Msg[], now: number): string[] {
  return toPublishMsgs(msgs, now).map((m) => m.id);
}

export function toPublishMsgs(msgs: readonly Msg[], now: number): Msg[] {
  return msgs
    .filter((m) => m.webhook_id && !((m.flags ?? 0) & CROSSPOSTED) && now - Date.parse(m.timestamp) < DAY)
    .reverse(); // oldest first, as they were posted
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return console.log("publish: no bot token, nothing done.");
  const h = { authorization: `Bot ${token}` };
  const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages?limit=10`, { headers: h, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return console.log(`publish: could not read the channel (HTTP ${r.status}).`);
  const msgs = toPublishMsgs((await r.json()) as Msg[], Date.now());
  const ids = msgs.map((m) => m.id);
  let ok = 0;
  let copies = 0;
  let gamePublished = 0;
  for (const m of msgs) {
    const id = m.id;
    const p = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages/${id}/crosspost`, { method: "POST", headers: h, signal: AbortSignal.timeout(10_000) });
    if (p.ok) {
      ok++;
      // Without the bot's Message Content intent Discord returns other senders' messages with no embeds, so nothing is copied.
      if (!m.embeds?.length) console.log(`publish: ${id} came back with no embeds (is the bot's Message Content intent on?)`);
      for (const [ch, g] of byGameChannel(m.embeds ?? [])) {
        const c = await fetch(`https://discord.com/api/v10/channels/${ch}/messages`, {
          method: "POST",
          headers: { ...h, "content-type": "application/json" },
          body: JSON.stringify(copyMessage(g)),
          signal: AbortSignal.timeout(10_000),
        });
        if (c.ok) {
          copies++;
          // Game rooms are announcement channels too (game-first rooms, 2026-11-26), so a partner server that runs one game
          // follows that game's room and gets only its drops. Publish the bot's own copy; member chat there is never published.
          const copy = (await c.json().catch(() => null)) as { id?: string } | null;
          if (copy?.id) {
            const x = await fetch(`https://discord.com/api/v10/channels/${ch}/messages/${copy.id}/crosspost`, { method: "POST", headers: h, signal: AbortSignal.timeout(10_000) });
            if (x.ok) gamePublished++;
            else console.log(`publish: copy ${copy.id} in ${ch} not published, HTTP ${x.status} (a plain text channel cannot be followed)`);
          }
        } else console.log(`publish: copy of ${id} to ${ch} answered HTTP ${c.status}${await c.json().then((b: { code?: number; message?: string }) => ` (code ${b.code}: ${b.message})`).catch(() => "")}`);
      }
    } else {
      // Discord's own error code says which permission is missing (50013 Missing Permissions, 50001 Missing Access).
      const why = await p.json().then((b: { code?: number; message?: string }) => ` (code ${b.code}: ${b.message})`).catch(() => "");
      console.log(`publish: ${id} answered HTTP ${p.status}${why}`);
    }
  }
  console.log(`publish: ${ok} of ${ids.length} drop(s) published to following servers, ${copies} game-channel cop${copies === 1 ? "y" : "ies"} (${gamePublished} published to servers following a game room).`);
}

if (process.argv[1]?.endsWith("discord-publish.ts")) main().catch((e) => console.log(`publish: ${e instanceof Error ? e.message : e}`));
