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

/**
 * Whether moving a report from `prev` to `next` should email the reporter a
 * thank-you. Before 2026-09-23 a reporter never heard back, and hearing "you
 * were right, it's fixed" is what turns a one-off reporter into a repeat one.
 *
 * FIXED ONLY. Not CONFIRMED — the price is still wrong at that point, so "thanks"
 * would be premature — and never REJECTED: telling a stranger they were mistaken
 * invites an argument over email.
 *
 * ON THE TRANSITION, not on the state. `prev !== "FIXED"` is what makes a second
 * click on an already-fixed report (or a re-save) send nothing, so one report is
 * at most one email. A report reopened and fixed again does send again — that is
 * a second fix, which is exactly when a second thank-you is true.
 */
export function shouldNotifyReporter(prev: ReportStatus, next: ReportStatus): boolean {
  return next === "FIXED" && prev !== "FIXED";
}

/**
 * The name and on-site link a "your report was fixed" email uses for a sealed
 * product, from one of its SealedListing rows.
 *
 * There is no per-product sealed page to link to — a tile on /sealed opens a
 * quick-view in place (see tools/rising-sealed's ProductCell) — so the link is
 * /sealed narrowed to the product:
 *   • set + type when the group has a set. Both are exact-match filters there,
 *     and a set-coded group's key IS `${setCode}|${type}`, so this lands on that
 *     one product rather than every booster box on the site.
 *   • ?q=<title> otherwise, the way SearchBar and Rising Sealed link a product:
 *     a setless group is keyed and named by its listing title.
 * `setName` is the display name for `row.setCode` (lib/constants SETS), passed in
 * so this module stays import-free for the form that shares it.
 */
export function sealedReportTarget(
  row: { title: string; productType: string; setCode: string | null },
  setName: string | null,
): { name: string; path: string } {
  if (row.setCode) {
    return {
      name: joinOverlapping(setName ?? row.setCode, row.productType),
      path: `/sealed?set=${encodeURIComponent(row.setCode)}&type=${encodeURIComponent(row.productType)}`,
    };
  }
  return { name: row.title, path: `/sealed?q=${encodeURIComponent(row.title)}` };
}

// "Origins: Proving Grounds" + "Proving Grounds Case" → "Origins: Proving Grounds
// Case", not the words twice: OGS is the one set whose name is also a product
// type. Merges on whole words only, so "Vendetta" + "Booster Box" is untouched.
function joinOverlapping(a: string, b: string): string {
  for (let i = 0; i < a.length; i++) {
    if (i > 0 && a[i - 1] !== " ") continue;
    const tail = a.slice(i);
    if (b.startsWith(tail) && (b.length === tail.length || b[tail.length] === " ")) return a.slice(0, i) + b;
  }
  return `${a} ${b}`;
}

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
