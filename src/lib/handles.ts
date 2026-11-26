// COMMUNITY HANDLES (2026-11-26, community plan move 3: "names on contributions"). One public name per member of the shared
// account, chosen by the member, shown on what they contribute on every site of the network ("First vouched by @name", the
// monthly Top deal hunters). Pure: no database, safe in the browser and the tests.
//
// Rules: 3 to 20 characters of a-z, 0-9 and _, starting with a letter, stored lowercase (so "@Bill" and "@bill" are one name).
// Never a name that reads as ours or as staff, and never one with an obvious slur or insult in it: refused, not edited.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
const SHAPE = /^[a-z][a-z0-9_]{2,19}$/;

// Names that would read as the site, the team or a brand we compare.
const RESERVED = [
  "admin", "administrator", "mod", "moderator", "staff", "support", "help", "official", "team", "owner", "system", "bot",
  "riftcompare", "compareempire", "tcgprices", "dexcompare", "mtgcompare", "ygocompare", "opcompare", "gundamcompare",
  "lorcanacompare", "cyberpunkcompare", "bandaicompare", "scentcompare", "kaeyoung", "sportscardcompare", "sealedsniper",
  "tcgplayer", "ebay", "amazon", "discord", "telegram", "anonymous", "null", "undefined", "everyone", "here",
];
const RESERVED_PART = ["admin", "moderator", "riftcompare", "compareempire", "tcgprices", "official", "staff"];
// A short list of words no public name may contain. Kept small and literal on purpose: it catches the obvious, and a
// report to the team catches the rest.
const BLOCKED_PART = ["fuck", "shit", "cunt", "nigg", "fag", "retard", "nazi", "hitler", "rape", "porn", "whore", "slut", "kike", "spic", "chink"];

export type HandleCheck = { ok: true; handle: string } | { ok: false; error: string };

/** Normalise and check a handle the member typed (a leading @ and surrounding spaces are fine). */
export function checkHandle(raw: unknown): HandleCheck {
  if (typeof raw !== "string") return { ok: false, error: "Pick a name." };
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  if (h.length < HANDLE_MIN) return { ok: false, error: `At least ${HANDLE_MIN} characters.` };
  if (h.length > HANDLE_MAX) return { ok: false, error: `At most ${HANDLE_MAX} characters.` };
  if (!SHAPE.test(h)) return { ok: false, error: "Letters, numbers and _ only, starting with a letter." };
  if (RESERVED.includes(h) || RESERVED_PART.some((r) => h.includes(r))) return { ok: false, error: "That name is reserved. Try another." };
  if (BLOCKED_PART.some((b) => h.replace(/_/g, "").includes(b))) return { ok: false, error: "Pick a different name." };
  return { ok: true, handle: h };
}

/** How a handle is printed. */
export function atHandle(h: string): string {
  return `@${h}`;
}
