// Posts one short text line from the hub bot into a hub room, and publishes it there when the room is a followable game
// room, so partner servers that follow the room get it too. Dispatch-only (discord-say.yml). First use: Riftbound Legacy
// reveal posts in #riftbound from 11 Dec (Win back RiftCompare visitors, 26 Nov), each linking riftcompare.com/sets/legacy.
// Never pings anyone; text only (posts with videos or images go through hub-announce.ts).
export const ROOMS: Record<string, { id: string; publish: boolean }> = {
  announcements: { id: "1564578305166803054", publish: false },
  pokemon: { id: "1573095127163998399", publish: true },
  "one-piece": { id: "1573095173410390159", publish: true },
  riftbound: { id: "1573095221007487037", publish: true },
  magic: { id: "1573095266444251146", publish: true },
  lorcana: { id: "1573095310010486855", publish: true },
  yugioh: { id: "1573095354407190699", publish: true },
  "more-tcgs": { id: "1574350129824141353", publish: true },
};

/** The text as posted, or a reason it is refused. */
export function checkText(raw: string): { ok: true; text: string } | { ok: false; why: string } {
  const text = raw.replace(/\\n/g, "\n").trim();
  if (!text) return { ok: false, why: "empty" };
  if (text.length > 1800) return { ok: false, why: "over 1,800 characters" };
  if (/@everyone|@here|<@&?\d+>/.test(text)) return { ok: false, why: "no pings" };
  return { ok: true, text };
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const room = ROOMS[(process.env.ROOM ?? "").trim()];
  const t = checkText(process.env.TEXT ?? "");
  if (!room) throw new Error(`unknown room; one of ${Object.keys(ROOMS).join(", ")}`);
  if (!t.ok) throw new Error(`text refused: ${t.why}`);
  if (!token) return console.log("discord-say: no bot token, nothing posted");
  const h = { authorization: `Bot ${token}`, "content-type": "application/json" };
  const r = await fetch(`https://discord.com/api/v10/channels/${room.id}/messages`, { method: "POST", headers: h, body: JSON.stringify({ content: t.text, allowed_mentions: { parse: [] } }) });
  if (!r.ok) throw new Error(`Discord post: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const m = (await r.json()) as { id: string };
  console.log(`discord-say: posted https://discord.com/channels/1564578153534591006/${room.id}/${m.id}`);
  if (room.publish) {
    const p = await fetch(`https://discord.com/api/v10/channels/${room.id}/messages/${m.id}/crosspost`, { method: "POST", headers: h });
    console.log(p.ok ? "discord-say: published to following servers" : `discord-say: publish failed, HTTP ${p.status}`);
  }
}

if (process.argv[1]?.endsWith("discord-say.ts")) main().catch((e) => {
  console.log(`discord-say: ${(e as Error).message}`);
  process.exitCode = 1;
});
