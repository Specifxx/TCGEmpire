// Where the giveaway is shown uninvited (owner, 2026-11-22: "we're not actually, can't find the giveaway. We got to feature
// it on our homepage ... have a pop-up or whatever to enter our giveaway"). DECISIONS.md, 2026-11-22 "Giveaway: on the home
// page and one corner card". Pure, so the tests hold the rules:
//   • the home page carries a banner under the hero while the giveaway is open (GiveawayHomeBanner);
//   • every other page may show ONE small corner card (GiveawayPrompt), never a modal, and it keeps the house rule
//     "one interruption per visit, never on arrival" (lib/rate-prompt.ts): never the first page of a visit, never in a
//     visit where the rating card or the Pricing callout already showed, never on the giveaway, account, sign-in or
//     Premium pages (the ad-free list), never after this browser entered or said "Don't show again", and at most
//     GIVEAWAY_PROMPT_MAX_SHOWS times, GIVEAWAY_PROMPT_GAP_MS apart. It stops by itself when the giveaway closes.
import { adFreePath } from "./ad-free-paths";
import { CURRENT_GIVEAWAY, giveawayState, type Giveaway } from "./giveaway";

export const GIVEAWAY_PROMPT_STORAGE_KEY = "rc_gw_prompt";
/** Set for the visit when the card shows: the rating card and the Pricing callout then stand down. */
export const GIVEAWAY_PROMPT_SESSION_KEY = "rc_gw_prompt_seen";
export const GIVEAWAY_PROMPT_AFTER_PAGES = 2;
export const GIVEAWAY_PROMPT_DELAY_MS = 6_000;
export const GIVEAWAY_PROMPT_MAX_SHOWS = 3;
export const GIVEAWAY_PROMPT_GAP_MS = 2 * 86_400_000;

export interface GiveawayPromptState {
  /** The giveaway this state belongs to: a new giveaway starts fresh. */
  key: string;
  shows: number;
  lastShownAt: number;
  /** "Don't show again", or this browser entered. */
  done: boolean;
}

export function freshPromptState(g: Giveaway = CURRENT_GIVEAWAY): GiveawayPromptState {
  return { key: g.key, shows: 0, lastShownAt: 0, done: false };
}

export function parsePromptState(raw: string | null, g: Giveaway = CURRENT_GIVEAWAY): GiveawayPromptState {
  if (!raw) return freshPromptState(g);
  try {
    const j = JSON.parse(raw) as Partial<GiveawayPromptState>;
    if (j.key !== g.key) return freshPromptState(g);
    return {
      key: g.key,
      shows: Number.isFinite(j.shows) ? Math.max(0, Number(j.shows)) : 0,
      lastShownAt: Number.isFinite(j.lastShownAt) ? Number(j.lastShownAt) : 0,
      done: j.done === true,
    };
  } catch {
    return freshPromptState(g);
  }
}

export function shouldShowGiveawayPrompt(
  s: GiveawayPromptState,
  now: number,
  path: string,
  visit: { pages: number; otherPromptShown: boolean },
  g: Giveaway = CURRENT_GIVEAWAY,
): boolean {
  if (giveawayState(g, new Date(now)) !== "open") return false;
  if (s.done || s.shows >= GIVEAWAY_PROMPT_MAX_SHOWS) return false;
  if (s.shows > 0 && now - s.lastShownAt < GIVEAWAY_PROMPT_GAP_MS) return false;
  if (visit.otherPromptShown) return false;
  if (visit.pages < GIVEAWAY_PROMPT_AFTER_PAGES) return false;
  const p = path.split(/[?#]/)[0];
  if (p === "/" || adFreePath(p) || p.startsWith("/admin")) return false;
  return true;
}

export function markShown(s: GiveawayPromptState, now: number): GiveawayPromptState {
  return { ...s, shows: s.shows + 1, lastShownAt: now };
}

export function markDone(s: GiveawayPromptState): GiveawayPromptState {
  return { ...s, done: true };
}
