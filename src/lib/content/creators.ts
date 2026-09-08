// Content-creator partnerships — a hand-curated list, same convention as
// articles.ts and constants.ts's SETS: no database table, no admin UI, just an
// array a PR edits. There is no ongoing volume here (partnerships are signed
// one at a time, by a human, over email) that would justify the overhead of a
// schema + admin form the way SealedListing or StorePartner earn theirs.
//
// DELIBERATELY NOT CALLED "partners" IN ANY URL, LABEL OR FILE PATH. That word
// already means something specific on this site — the eBay/TCGplayer affiliate
// marks in PartnersStrip.tsx ("Approved partners"), an economic relationship
// disclosed via AffiliateDisclosure. A creator partnership is a promotional
// one, not an affiliate one, and reusing the word would blur a distinction the
// site is legally careful about elsewhere. "Creator(s)" throughout instead.
//
// HOW TO ADD ONE: append an entry below once a partnership is actually
// confirmed — this list is what /creators renders directly, so anything here
// is live and public immediately.
export interface CreatorPartner {
  name: string;
  /** What they're known for, one line — shown under their name. */
  blurb: string;
  platform: "YouTube" | "Twitch" | "TikTok" | "Twitter/X" | "Instagram" | "Discord";
  /** As displayed, e.g. "@handle" — platform convention varies, so no leading @ is assumed. */
  handle: string;
  url: string;
  /** ISO date the partnership went live — newest-first display, not editorial. */
  since: string;
}

// Empty for now — outreach is just starting (2026-09-05). Example shape once
// the first one is confirmed:
//   {
//     name: "Some Creator",
//     blurb: "Riftbound deck techs and set-review videos",
//     platform: "YouTube",
//     handle: "@somecreator",
//     url: "https://youtube.com/@somecreator",
//     since: "2026-09-15",
//   },
export const CREATOR_PARTNERS: CreatorPartner[] = [];
