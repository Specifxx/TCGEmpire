// Riftbound creators featured on /creators — a hand-curated list, same convention
// as articles.ts and constants.ts's SETS: no database table, no admin UI, just an
// array a commit edits. Partnerships are agreed one at a time, by a person, so
// there is no volume that would earn a schema and an admin form.
//
// THE DEAL (owner, 2026-10-15). RiftCompare reaches out to Riftbound creators.
// A creator mentions or links RiftCompare in their content; in return they get a
// card here (and on the homepage widget) with their socials and a "Buy them a
// pack" button. That button goes to the creator's OWN tip page (Ko-fi, Buy Me a
// Coffee, Patreon, Streamlabs...): RiftCompare never handles the money and takes
// no cut, and the page says so. Clicks on a creator's links are counted in GA4
// (creator_click / creator_tip_click) so each creator can be shown what the
// listing sent them.
//
// DELIBERATELY NOT CALLED "partners" IN ANY URL OR LABEL. That word already means
// the eBay/TCGplayer affiliate relationships (PartnersStrip, AffiliateDisclosure),
// an economic relationship disclosed as one. A creator listing is promotional,
// not affiliate. "Creators" throughout instead.
//
// HOW TO ADD ONE: append an entry once a creator has agreed. Anything here is
// live and public on the next release. Use the creator's own spelling and handle,
// and only links they gave us.

export type CreatorPlatform = "YouTube" | "Twitch" | "TikTok" | "Instagram" | "X" | "Discord" | "Website";

export interface CreatorLink {
  platform: CreatorPlatform;
  url: string;
  /** As displayed, e.g. "@handle". */
  handle?: string;
}

export interface Creator {
  /** Stable id, used in analytics: lowercase, hyphens. */
  slug: string;
  name: string;
  /** What they make, one line. */
  blurb: string;
  /** Their channels, most important first. The first is the card's main link. */
  links: CreatorLink[];
  /** Their own tip page. Shown as "Buy them a pack". Omit if they have none. */
  tipUrl?: string;
  /** Short content tags, e.g. "Deck techs", "Pack openings". At most three show. */
  tags?: string[];
  /** Where they're based, if they're happy to say ("AU", "US"...). */
  region?: string;
  /** Their main champion, shown as a chip. */
  champion?: string;
  /** A square avatar they supplied, in public/creators/. Initials are used without one. */
  avatar?: string;
  /** ISO date the listing went live. Newest first. */
  since: string;
}

// Empty until the first creator agrees (outreach starts 2026-10-15). Example:
//   {
//     slug: "some-creator",
//     name: "Some Creator",
//     blurb: "Riftbound deck techs and Radiance pack openings",
//     links: [
//       { platform: "YouTube", url: "https://youtube.com/@somecreator", handle: "@somecreator" },
//       { platform: "TikTok", url: "https://tiktok.com/@somecreator", handle: "@somecreator" },
//     ],
//     tipUrl: "https://ko-fi.com/somecreator",
//     tags: ["Deck techs", "Pack openings"],
//     region: "AU",
//     champion: "Ahri",
//     since: "2026-10-20",
//   },
export const CREATORS: Creator[] = [];

/** Newest listing first. */
export function featuredCreators(list: readonly Creator[] = CREATORS): Creator[] {
  return [...list].sort((a, b) => b.since.localeCompare(a.since));
}

export const PLATFORM_STYLE: Record<CreatorPlatform, { bg: string; fg: string }> = {
  YouTube: { bg: "#ff0033", fg: "#ffffff" },
  Twitch: { bg: "#9146ff", fg: "#ffffff" },
  TikTok: { bg: "#111111", fg: "#ffffff" },
  Instagram: { bg: "#e1306c", fg: "#ffffff" },
  X: { bg: "#000000", fg: "#ffffff" },
  Discord: { bg: "#5865f2", fg: "#ffffff" },
  Website: { bg: "#334155", fg: "#ffffff" },
};

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}
