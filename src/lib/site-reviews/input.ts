// What a sister site's rating card may send (/api/site-reviews). Pure, so the
// rules are pinned by tests/site-reviews.test.ts.
//
// • stars 1–5, or a written review of at least MIN_MESSAGE characters, or both;
// • "rating" is the first send (its stars count), "rating-review" the words
//   added after the stars were already saved (they repeat the stars, which the
//   score leaves out: lib/site-reviews/read.ts);
// • a name is kept only when the writer agreed to show the review;
// • the honeypot field `website` is a bot: accepted and dropped.

export const MAX_MESSAGE = 2000;
export const MIN_MESSAGE = 10;
export const MAX_NAME = 60;
export const MAX_PAGE = 200;

export type SiteReviewRow = {
  rating: number | null;
  message: string;
  source: "rating" | "rating-review";
  consentPublic: boolean;
  displayName: string | null;
  page: string | null;
};

export type ParsedSiteReview = { kind: "ok"; row: SiteReviewRow } | { kind: "bot" } | { kind: "error"; error: string };

function str(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  // Postgres text can't hold NUL, and nothing a person types needs it.
  return raw.replace(/\u0000/g, "").trim().slice(0, max);
}

export function parseSiteReview(body: unknown): ParsedSiteReview {
  if (!body || typeof body !== "object") return { kind: "error", error: "Nothing to send." };
  const b = body as Record<string, unknown>;
  if (typeof b.website === "string" && b.website.trim() !== "") return { kind: "bot" };

  const n = Number(b.rating);
  const rating = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  const message = str(b.message, MAX_MESSAGE);
  if (rating == null && message.length < MIN_MESSAGE) {
    return { kind: "error", error: `Pick a star rating, or write a little more (at least ${MIN_MESSAGE} characters).` };
  }
  const source = b.source === "rating-review" && rating != null && message ? "rating-review" : "rating";
  const consentPublic = b.consentPublic === true;
  const page = str(b.page, MAX_PAGE);
  return {
    kind: "ok",
    row: {
      rating,
      message,
      source,
      consentPublic,
      displayName: consentPublic ? str(b.displayName, MAX_NAME) || null : null,
      page: page.startsWith("/") ? page : null,
    },
  };
}
