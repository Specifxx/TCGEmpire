// Deck Coach, a two-week concierge test (owner's go via the coordinator, 2026-11-19;
// DECISIONS.md "Deck Coach test"). A player pastes a deck, a budget and an event; the
// team writes the report by hand and emails it. No AI API call is made by the site.
// Requests are Feedback rows with source "coach" (never consentPublic, never rated, so
// no review, rating or public surface ever reads them); /admin/coach lists them.
// Read on 3 Dec 2026: go if 100+ decks AND 30+ founder-price taps; stop under 40 decks.

export const COACH_SOURCE = "coach";
export const COACH_CAP = 40; // reports the team promises to write during the test
export const COACH_PRICE = "US$7.99";
export const COACH_FOUNDER_PRICE = "US$5.99";
export const COACH_READ_DATE = "2026-12-03";

export const COACH_FORMATS = ["Standard", "2v2 Constructed", "Casual"] as const;
export const COACH_BUDGETS = ["Under US$25", "US$25–50", "US$50–100", "US$100–200", "No limit"] as const;

export const MAX_DECK = 3000;
export const MIN_DECK = 20;

export interface CoachRequest {
  deck: string;
  legend: string | null;
  format: string;
  budget: string;
  event: string | null;
  goal: string | null;
  founder: boolean;
}

const pick = <T extends readonly string[]>(v: unknown, list: T, fallback: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? v : fallback;

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
};

/** Cleans a submission; null when the deck is missing or too short to review. */
export function parseCoachRequest(body: unknown): CoachRequest | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const deck = str(b.deck, MAX_DECK);
  if (!deck || deck.length < MIN_DECK) return null;
  return {
    deck,
    legend: str(b.legend, 80),
    format: pick(b.format, COACH_FORMATS, "Standard"),
    budget: pick(b.budget, COACH_BUDGETS, "No limit"),
    event: str(b.event, 120),
    goal: str(b.goal, 600),
    founder: b.founder === true,
  };
}

/** The row's message: one readable block the team works from. */
export function coachMessage(r: CoachRequest): string {
  return [
    `Legend: ${r.legend ?? "not given"}`,
    `Format: ${r.format}`,
    `Budget: ${r.budget}`,
    `Event: ${r.event ?? "not given"}`,
    `Founder price: ${r.founder ? "YES" : "no"}`,
    r.goal ? `Wants: ${r.goal}` : null,
    "",
    r.deck,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export const isFounderTap = (message: string) => /^Founder price: YES$/m.test(message);
