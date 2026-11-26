// Posts one prepared announcement to the hub's Discord #announcements (as the hub bot, with its attachments) and to the
// Telegram channel, then pins both. Dispatch-only (hub-announce.yml): a person or the Discord thread runs it for a post
// folder under social/hub-posts/<id>/ holding post.md (the text) and up to 4 attachments (mp4, jpg, png).
// Why: hand posts went through Bill's desktop browser, which can't attach local files and is off when his computer is.
// Never pings anyone; a missing token skips that channel; a failed pin is logged, never fatal.
import fs from "node:fs";
import path from "node:path";

const CHANNEL = "1564578305166803054"; // #announcements in TCG Deals & Restocks
const TELEGRAM_CHAT = "@tcgdealsrestocks";
const MEDIA = /\.(mp4|jpe?g|png)$/i;

export function readPost(dir: string): { text: string; files: string[] } {
  const text = fs.readFileSync(path.join(dir, "post.md"), "utf8").trim();
  if (!text || text.length > 2000) throw new Error(`post.md must be 1-2000 characters (is ${text.length})`);
  const files = fs.readdirSync(dir).filter((f) => MEDIA.test(f)).sort().slice(0, 4).map((f) => path.join(dir, f));
  return { text, files };
}

/** Discord markdown to Telegram plain text: no bold markers, links as "text: url". */
export const telegramPlain = (t: string): string => t.replace(/\*\*/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2").replace(/<(https?:\S+)>/g, "$1");

const mime = (f: string) => (f.endsWith(".mp4") ? "video/mp4" : f.endsWith(".png") ? "image/png" : "image/jpeg");

async function discord(token: string, text: string, files: string[]): Promise<void> {
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: text, allowed_mentions: { parse: [] } }));
  files.forEach((f, i) => form.append(`files[${i}]`, new Blob([fs.readFileSync(f)], { type: mime(f) }), path.basename(f)));
  const h = { authorization: `Bot ${token}` };
  const r = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/messages`, { method: "POST", headers: h, body: form });
  if (!r.ok) throw new Error(`Discord post: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const m = (await r.json()) as { id: string };
  console.log(`discord: posted https://discord.com/channels/1564578153534591006/${CHANNEL}/${m.id}`);
  const p = await fetch(`https://discord.com/api/v10/channels/${CHANNEL}/pins/${m.id}`, { method: "PUT", headers: h });
  console.log(p.ok ? "discord: pinned" : `discord: pin failed, HTTP ${p.status} (the bot may lack Manage Messages)`);
}

async function telegram(token: string, text: string, files: string[]): Promise<void> {
  const api = (m: string) => `https://api.telegram.org/bot${token}/${m}`;
  const r = await fetch(api("sendMessage"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: telegramPlain(text), disable_web_page_preview: true }) });
  const j = (await r.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
  if (!j.ok || !j.result) throw new Error(`Telegram post: ${j.description ?? r.status}`);
  console.log(`telegram: posted https://t.me/tcgdealsrestocks/${j.result.message_id}`);
  if (files.length) {
    const form = new FormData();
    form.append("chat_id", TELEGRAM_CHAT);
    form.append("media", JSON.stringify(files.map((f, i) => ({ type: f.endsWith(".mp4") ? "video" : "photo", media: `attach://f${i}`, ...(f.endsWith(".mp4") ? { supports_streaming: true } : {}) }))));
    files.forEach((f, i) => form.append(`f${i}`, new Blob([fs.readFileSync(f)], { type: mime(f) }), path.basename(f)));
    const g = (await (await fetch(api("sendMediaGroup"), { method: "POST", body: form })).json()) as { ok: boolean; description?: string };
    console.log(g.ok ? `telegram: ${files.length} attachments sent` : `telegram: attachments failed: ${g.description}`);
  }
  const p = (await (await fetch(api("pinChatMessage"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT, message_id: j.result.message_id, disable_notification: true }) })).json()) as { ok: boolean; description?: string };
  console.log(p.ok ? "telegram: pinned" : `telegram: pin failed: ${p.description}`);
}

async function main() {
  const id = (process.env.POST ?? "").trim();
  if (!/^[\w-]+$/.test(id)) throw new Error("POST must be a folder name under social/hub-posts/");
  const { text, files } = readPost(path.join(process.cwd(), "social", "hub-posts", id));
  const only = (process.env.ONLY ?? "both").trim();
  const dt = process.env.DISCORD_BOT_TOKEN?.trim();
  const tt = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (only !== "telegram") dt ? await discord(dt, text, files) : console.log("discord: no bot token, skipped");
  if (only !== "discord") tt ? await telegram(tt, text, files) : console.log("telegram: no bot token, skipped");
}

if (process.argv[1]?.endsWith("hub-announce.ts")) main().catch((e) => {
  console.log(`hub-announce: ${(e as Error).message}`);
  process.exitCode = 1;
});
