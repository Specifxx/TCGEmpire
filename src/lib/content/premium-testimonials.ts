// What Premium members have said, for /premium's testimonials slot (2026-10-23,
// DECISIONS.md "/premium, rebuilt to convert, honestly").
//
// EMPTY BY DEFAULT, AND IT STAYS EMPTY UNTIL A REAL MEMBER SAYS SOMETHING. Add
// an entry only with the member's written permission to quote them, in their
// own words, attributed the way they asked (a first name, a handle, or
// "Premium member since …"). Never paraphrase into a stronger claim, never
// invent one, never quote a store or creator who is paid by us without saying
// so. The slot on /premium renders NOTHING while this list is empty
// (tests/premium-page.test.ts pins that).
export interface PremiumTestimonial {
  quote: string;
  /** How the member asked to be named. */
  name: string;
  /** Optional context, e.g. "Premium since Oct 2026" or their market. */
  detail?: string;
  /** Where the permission is recorded (an email date, a feedback id). Never shown. */
  permission: string;
}

export const PREMIUM_TESTIMONIALS: readonly PremiumTestimonial[] = [];
