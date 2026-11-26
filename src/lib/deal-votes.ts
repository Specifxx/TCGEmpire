import { createHmac } from "node:crypto";
import { authSecret } from "./auth-secret";

// SEALED SNIPER DEAL VOTES (owner's COO, 2026-11-26; OzBargain study, move 1): visitors of a sister
// site's deal board mark a drop hot or cold, or flag it expired. Phase one of a TCG deal board.
//   • No sign-in. One vote per drop per visitor, where a visitor is an HMAC of IP + user agent under a key
//     derived from AUTH_SECRET: the raw address is never stored or logged.
//   • Votes never order prices, never change a drop, a store row or an alert: they are shown beside the drop only.
//   • Reads are one bounded, select-limited groupBy over at most MAX_IDS drops; the GET is CDN-cached
//     (six hours, CLAUDE.md), and a vote's own response carries that drop's fresh tally.

export const DEAL_VOTE_SITES = ["tcgprices"] as const;
export type DealVoteSite = (typeof DEAL_VOTE_SITES)[number];
export const MAX_IDS = 60;
export const DROP_ID = /^[a-z0-9-]{6,64}$/;

export type Tally = { hot: number; cold: number; expired: number };
export const EMPTY: Tally = { hot: 0, cold: 0, expired: 0 };

let derived: Buffer | null = null;
function key(): Buffer {
  if (!derived) derived = createHmac("sha256", Buffer.from(authSecret())).update("deal-vote:v1").digest();
  return derived;
}

/** The stored voter id: never the address itself. */
export function voterId(ip: string, ua: string): string {
  return createHmac("sha256", key()).update(`${ip}\n${ua.slice(0, 300)}`).digest("base64url").slice(0, 22);
}

export type VoteAction = "hot" | "cold" | "expired" | "clear";

/** What a row should become after an action; null deletes it. */
export function apply(prev: { vote: number; expired: boolean } | null, action: VoteAction): { vote: number; expired: boolean } | null {
  const cur = prev ?? { vote: 0, expired: false };
  const next =
    action === "hot" ? { ...cur, vote: cur.vote === 1 ? 0 : 1 }
    : action === "cold" ? { ...cur, vote: cur.vote === -1 ? 0 : -1 }
    : action === "expired" ? { ...cur, expired: !cur.expired }
    : { vote: 0, expired: false };
  return next.vote === 0 && !next.expired ? null : next;
}

/** Rows grouped by (dropId, vote, expired) with counts → one tally per drop. */
export function tallies(rows: readonly { dropId: string; vote: number; expired: boolean; n: number }[]): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const r of rows) {
    const t = (out[r.dropId] ??= { ...EMPTY });
    if (r.vote === 1) t.hot += r.n;
    if (r.vote === -1) t.cold += r.n;
    if (r.expired) t.expired += r.n;
  }
  return out;
}

/** Parse the ids query: unique, valid, at most MAX_IDS. */
export function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => DROP_ID.test(s)))].slice(0, MAX_IDS);
}
