// DISCOUNT CODE VOTES (owner, 2026-11-26; OzBargain study, move 3): visitors of a sister site's discount-code pages
// say whether a store's code worked at checkout, or that it has expired. Built on the deal board's DealVote table
// (lib/deal-votes.ts), with no schema change:
//   • every code vote is stored under the one site key CODE_SITE ("codes"), so a store listed on two sites (Stylevana on
//     ScentCompare and KaeYoung) shares one tally per code: more votes, one truth;
//   • "worked" is vote 1, "didn't work" is vote -1, "expired" is the deal board's separate flag;
//   • the voter is the deal board's keyed HMAC of IP + user agent (voterId): the address is never stored or logged.
// Votes never order a price, a store row or a code list's links; they are shown beside the code only. A code id is
// the sister's own ("aw-<Awin promotion id>"), validated like a drop id.
import { DROP_ID, MAX_IDS, apply, type VoteAction } from "./deal-votes";

/** The DealVote.site every code vote is stored under. */
export const CODE_SITE = "codes";
/** The sister sites whose exact origins may vote (sister-alerts' list decides each origin). */
export const CODE_VOTE_SITES = ["scent", "kaeyoung", "tcgprices"] as const;
export const CODE_ID = DROP_ID;
export const MAX_CODE_IDS = MAX_IDS;

export type CodeAction = "worked" | "failed" | "expired" | "clear";
export type CodeTally = { worked: number; failed: number; expired: number; /** the newest "worked" vote, ISO */ lastWorked: string | null };
export const EMPTY_CODE: CodeTally = { worked: 0, failed: 0, expired: 0, lastWorked: null };

const TO_DEAL: Record<CodeAction, VoteAction> = { worked: "hot", failed: "cold", expired: "expired", clear: "clear" };

/** What a voter's row becomes after an action (the deal board's rules: a second tap undoes, worked and failed exclude each other). */
export function applyCode(prev: { vote: number; expired: boolean } | null, action: CodeAction) {
  return apply(prev, TO_DEAL[action]);
}

/** Grouped rows (dropId, vote, expired, count, newest at) → one tally per code. */
export function codeTallies(rows: readonly { dropId: string; vote: number; expired: boolean; n: number; last: Date | string | null }[]): Record<string, CodeTally> {
  const out: Record<string, CodeTally> = {};
  for (const r of rows) {
    const t = (out[r.dropId] ??= { ...EMPTY_CODE });
    if (r.vote === 1) {
      t.worked += r.n;
      const at = r.last ? new Date(r.last).toISOString() : null;
      if (at && (!t.lastWorked || at > t.lastWorked)) t.lastWorked = at;
    }
    if (r.vote === -1) t.failed += r.n;
    if (r.expired) t.expired += r.n;
  }
  return out;
}

/** The ids query: unique, valid, at most MAX_CODE_IDS. */
export function parseCodeIds(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => CODE_ID.test(s)))].slice(0, MAX_CODE_IDS);
}
