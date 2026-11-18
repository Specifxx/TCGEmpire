// Live chat pilot (owner, 2026-11-18; docs/chat.md). Pure rules, no database: the rooms, what a message may be, the per-member rate limit and the
// kill switch's arithmetic. Reuses the forum's word list, so chat and forum refuse the same things.
import { hasHoldWord, redact } from "../forum/core";

/** The one config switch: "off" (default, nothing is drawn or served), "on". The monitor can also trip it (see `CHAT_OFF_KEY`). */
export const CHAT_MODE: "off" | "on" = "off";

export const ROOMS = [
  { id: "riftbound", label: "Riftbound", blurb: "Cards, prices, decks and deals." },
  { id: "general", label: "General", blurb: "Anything about collecting and TCGs." },
] as const;
export type RoomId = (typeof ROOMS)[number]["id"];
export const isRoom = (s: unknown): s is RoomId => ROOMS.some((r) => r.id === s);

export const LIMITS = {
  max: 280,
  /** One message every 3 seconds, ten a minute, 120 an hour per member (in memory, per server instance). */
  perMinute: 10,
  perHour: 120,
  minGapMs: 3000,
  /** Rows a read returns, and how long a message lives. */
  readTake: 50,
  ttlMs: 7 * 24 * 3600 * 1000,
  /** Reports that hide a message until a moderator looks. */
  autoHideReports: 3,
  /** The CDN holds a room's latest messages this long; the browser polls no faster than pollMs, and only while the panel is open and visible. */
  cacheSeconds: 5,
  pollMs: 6000,
} as const;

/** The Counter row that turns chat off whatever CHAT_MODE says. The ops monitor writes it when the database nears its compute allowance. */
export const CHAT_OFF_KEY = "chat-off";

export type Checked = { ok: true; body: string } | { ok: false; error: string };

/** What a message may be: plain text, 1 to 280 characters, no links, no contact details, nothing on the hold list, not shouting or mashing. */
export function checkMessage(raw: unknown): Checked {
  if (typeof raw !== "string") return { ok: false, error: "Write a message first." };
  const body = redact(raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim());
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > LIMITS.max) return { ok: false, error: `Keep it under ${LIMITS.max} characters.` };
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|gg|co|me|xyz|ly|tv)\b)/i.test(body)) return { ok: false, error: "Links aren't allowed in chat." };
  if (hasHoldWord(body)) return { ok: false, error: "That message isn't allowed here." };
  const letters = body.replace(/[^a-z]/gi, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) return { ok: false, error: "Please don't shout." };
  if (/(.)\1{9,}/.test(body)) return { ok: false, error: "That looks like keyboard mashing." };
  return { ok: true, body };
}

const hits = new Map<string, number[]>();
/** A reason this member must wait, or null (and the send is counted). Per server instance: a soft limit, like every limit on this site. */
export function rateProblem(userId: string, now = Date.now()): string | null {
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3600_000) hits.delete(k);
  const h = (hits.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (h.length && now - h[h.length - 1] < LIMITS.minGapMs) return "Slow down a little.";
  if (h.filter((t) => now - t < 60_000).length >= LIMITS.perMinute) return "You're sending too fast. Try again in a minute.";
  if (h.length >= LIMITS.perHour) return "That's a lot of messages this hour. Take a break.";
  h.push(now);
  hits.set(userId, h);
  return null;
}
export const resetRates = () => hits.clear();

/** Names for the room list ("Sam K."): a first name and an initial, never an email. */
export function chatName(displayName: string): string {
  if (displayName.includes("@")) return "Member";
  const n = displayName.replace(/\s+/g, " ").trim();
  const [a, b] = n.split(" ");
  const first = (a ?? "").slice(0, 16) || "Member";
  return b ? `${first} ${b[0]!.toUpperCase()}.` : first;
}

/** The monitor's rule: trip chat off when compute used reaches `tripAt` (default 75%) of the allowance, and back on below `clearAt` (60%). */
export function chatShouldBeOff(computeSeconds: number | null, limitSeconds: number, currentlyOff: boolean, tripAt = 0.75, clearAt = 0.6): boolean {
  if (computeSeconds == null || !(limitSeconds > 0)) return currentlyOff;
  const pct = computeSeconds / limitSeconds;
  return currentlyOff ? pct >= clearAt : pct >= tripAt;
}
export const NEON_FREE_COMPUTE_SECONDS = 100 * 3600;
