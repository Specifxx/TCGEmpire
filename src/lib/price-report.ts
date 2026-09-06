// The "this price is wrong" contract — ONE definition, imported by both the form
// and the API route.
//
// Deliberately a shared module rather than a list in the component and a
// matching Set in the route. Those drift: someone adds an option to the dropdown,
// the route's allow-list doesn't know it, and every report of the new kind is
// rejected with a validation error nobody sees because the form thinks it sent
// something valid. Client-safe (no prisma, no next/headers), so the form can
// import it directly.

/** The reasons a listing can be wrong, in the order the form offers them. */
export const ISSUES = [
  {
    code: "PRICE_WRONG",
    label: "The price is wrong",
    hint: "The store's page shows a different price.",
    /** Only this one asks for a corrected figure — the others have no price to give. */
    wantsPrice: true,
  },
  {
    code: "OUT_OF_STOCK",
    label: "It's out of stock",
    hint: "We list it as available; the store doesn't have it.",
    wantsPrice: false,
  },
  {
    code: "WRONG_ITEM",
    label: "Wrong card or product",
    hint: "The link goes to something else — a different printing, set or size.",
    wantsPrice: false,
  },
  {
    code: "LINK_BROKEN",
    label: "The link doesn't work",
    hint: "It 404s, redirects to a search, or goes to the store's home page.",
    wantsPrice: false,
  },
  { code: "OTHER", label: "Something else", hint: "Tell us below.", wantsPrice: false },
] as const;

export type IssueCode = (typeof ISSUES)[number]["code"];

export const ISSUE_CODES: ReadonlySet<string> = new Set(ISSUES.map((i) => i.code));

export function issueLabel(code: string): string {
  return ISSUES.find((i) => i.code === code)?.label ?? code;
}

/** True when this issue's form should ask for the real price. */
export function issueWantsPrice(code: string): boolean {
  return ISSUES.find((i) => i.code === code)?.wantsPrice ?? false;
}

/** What kind of thing was reported. */
export type ReportKind = "card" | "sealed";
export const REPORT_KINDS: ReadonlySet<string> = new Set<ReportKind>(["card", "sealed"]);

/** Admin triage states. NEW is the schema default; the rest are set by hand. */
export const REPORT_STATUSES = ["NEW", "CONFIRMED", "REJECTED", "FIXED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const MAX_NOTE = 1000;
export const MAX_EMAIL = 200;
export const MAX_PAGE = 200;
/**
 * Upper bound on a claimed corrected price, in cents. A hundred thousand dollars
 * is far above anything Riftbound trades at, so this rejects a fat-finger or a
 * junk submission without ever getting in the way of a real correction — the
 * most expensive card the site tracks is three orders of magnitude below it.
 */
export const MAX_CLAIM_CENTS = 10_000_000;

/**
 * One listing a visitor can point at, as the form needs it.
 *
 * NOTE WHAT IS ABSENT: the price. The form never sends one, and the API never
 * reads one from the request — the "what we were showing" figure is looked up
 * server-side from our own database (see the route). A price a stranger can put
 * straight into an admin screen is a price the admin cannot trust, and that
 * figure is the half of the report that has to be trustworthy.
 */
export interface ReportableListing {
  /** RetailerPrice.id, where the surface has one. Sealed listings have no id. */
  listingId?: string;
  retailer: string;
  retailerName: string;
}

/** Everything identifying WHAT is being reported, shared by every surface. */
export type ReportSubject =
  | { kind: "card"; cardId: string; name: string }
  | { kind: "sealed"; groupKey: string; name: string };
