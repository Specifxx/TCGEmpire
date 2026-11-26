// Posts the month's Top deal hunters in the hub's #announcements (community plan move 3, 2026-11-26): the handles and
// points members earned voting Sealed Sniper drops hot or cold, or flagging them gone, on tcgprices.app/drops while
// signed in. Reads the public, CDN-cached list (/api/community/top, TCGEmpire #685). Handles only, never a ping; an empty
// list posts nothing. Runs on the 1st of each month (discord-top-hunters.yml) for the month before. Never fails the run.
const CHANNEL = "1564578305166803054"; // #announcements in TCG Deals & Restocks
const SHOWN = 10;

export interface Hunter {
  handle: string;
  points: number;
  contributions?: number;
}

/** The month before `now`, as YYYY-MM (UTC). */
export function previousMonth(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** A handle shown as plain text: no markdown, no mention, no link, at most 32 characters. */
export function safeHandle(h: string): string {
  return h
    .replace(/[\u0000-\u001f\u200b-\u200f\u2028\u2029]/g, "")
    .replace(/[@#<>*_~`|\\[\]()]/g, "")
    .replace(/https?:\/\/\S*/gi, "")
    .trim()
    .slice(0, 32);
}

/** The post, or null when nobody earned a point that month. */
export function topHuntersMessage(month: string, top: readonly Hunter[]) {
  const rows = top
    .filter((h) => h.points > 0)
    .map((h) => ({ ...h, handle: safeHandle(h.handle) }))
    .filter((h) => h.handle)
    .slice(0, SHOWN);
  if (!rows.length) return null;
  const name = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const medal = ["🥇", "🥈", "🥉"];
  const lines = rows.map((h, i) => `${medal[i] ?? `${i + 1}.`} ${h.handle}: ${h.points} point${h.points === 1 ? "" : "s"}`);
  return {
    content: [
      `**Top deal hunters, ${name}**`,
      "Thanks to everyone who checked the Sealed Sniper's drops last month.",
      "",
      ...lines,
      "",
      "Get on next month's list: pick a name on your profile, sign in, then vote drops hot or cold or flag them gone at <https://tcgprices.app/drops>.",
    ].join("\n"),
    allowed_mentions: { parse: [] as never[] },
  };
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return console.log("top hunters: no bot token, nothing done.");
  const month = process.env.MONTH?.trim() || previousMonth(new Date());
  const r = await fetch(`https://riftcompare.com/api/community/top?site=all&month=${month}`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return console.log(`top hunters: list answered HTTP ${r.status}, nothing posted.`);
  const body = (await r.json().catch(() => null)) as { top?: Hunter[] } | null;
  const msg = topHuntersMessage(month, body?.top ?? []);
  if (!msg) return console.log(`top hunters: nobody on the ${month} list, nothing posted.`);
  const p = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages`, {
    method: "POST",
    headers: { authorization: `Bot ${token}`, "content-type": "application/json" },
    body: JSON.stringify(msg),
    signal: AbortSignal.timeout(10_000),
  });
  console.log(p.ok ? `top hunters: ${month} posted.` : `top hunters: post answered HTTP ${p.status}.`);
}

if (process.argv[1]?.endsWith("discord-top-hunters.ts")) main().catch((e) => console.log(`top hunters: ${e instanceof Error ? e.message : e}`));
