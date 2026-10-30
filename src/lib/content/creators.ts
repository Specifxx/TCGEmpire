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
// live and public on the next release, unless it says `status: "pending"`. Use the
// creator's own spelling and handle, and only links they gave us.
//
// PENDING CREATORS (owner, 2026-10-30). A creator we have made an offer to but who
// has not yet sent their name, bio and avatar is entered with `status: "pending"`.
// ALL_CREATORS holds every entry; CREATORS is only the confirmed ones, and it is
// what every page, route, share image, edit link and the weekly rotation reads, so
// a pending entry appears nowhere on the site. To publish one, fill in what they
// sent and set `status: "confirmed"` (or delete the line): tests/creators-pending.test.ts
// refuses a confirmed creator without a blurb.

export type CreatorPlatform = "YouTube" | "Twitch" | "TikTok" | "Instagram" | "X" | "Discord" | "Website" | "Email";

export interface CreatorLink {
  platform: CreatorPlatform;
  url: string;
  /** As displayed, e.g. "@handle". */
  handle?: string;
}

export type CreatorStatus = "pending" | "confirmed";

export interface Creator {
  /** "pending" keeps the entry off the site (see PENDING CREATORS above). Absent means confirmed. */
  status?: CreatorStatus;
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
  /** Creator of the week: listed first with a badge. One at a time. Computed by
   *  featuredCreators() from the weekly rotation (creatorOfTheWeek), never set by hand. */
  ofTheWeek?: boolean;
  /** ISO date the listing went live. Newest first. */
  since: string;
  /** Their RiftCompare creator code (an active Affiliate row, /admin/affiliates),
   *  shown as "20% off Premium" and linked through riftcompare.com/r/CODE, which
   *  credits them. Only a code that is live: an inactive one gives no discount. */
  code?: { code: string; percentOff: number };
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
// Creators with a creator code (2026-10-19, owner: "add the creators we have
// onboarded with a creator code to the public creators page").
export const ALL_CREATORS: Creator[] = [
  {
    slug: "keishun",
    name: "Keishun",
    blurb: "Riftbound content on Instagram. Our first creator partner.",
    links: [{ platform: "Instagram", url: "https://www.instagram.com/keishun.riftbound/", handle: "@keishun.riftbound" }],
    avatar: "/creators/keishun.jpg",
    code: { code: "KEISHUN20", percentOff: 20 },
    since: "2026-10-19",
  },
  {
    slug: "ripsbyjosh",
    name: "Josh",
    blurb: "Riftbound pack rips on Instagram.",
    links: [{ platform: "Instagram", url: "https://www.instagram.com/ripsbyjosh/", handle: "@ripsbyjosh" }],
    avatar: "/creators/ripsbyjosh.jpg",
    code: { code: "JOSH20", percentOff: 20 },
    since: "2026-10-20",
  },
  {
    slug: "riftsandbounds",
    name: "Matt",
    blurb: "Educational Riftbound TCG content and theory videos.",
    links: [
      { platform: "YouTube", url: "https://www.youtube.com/@riftsandboundstcg", handle: "@riftsandboundstcg" },
      { platform: "TikTok", url: "https://www.tiktok.com/@rifts.and.bounds", handle: "@rifts.and.bounds" },
      { platform: "Instagram", url: "https://www.instagram.com/riftsandbounds/", handle: "@riftsandbounds" },
    ],
    avatar: "/creators/riftsandbounds.jpg",
    tags: ["Theory", "Education"],
    since: "2026-10-22",
  },
  {
    slug: "riftbound-felipe",
    name: "Felipe Ponce",
    blurb: "Riftbound content creator, on the road to the Stuttgart Regional.",
    links: [
      { platform: "Instagram", url: "https://www.instagram.com/riftbound.felipe/", handle: "@riftbound.felipe" },
      { platform: "Website", url: "https://linktr.ee/felipe.ponce", handle: "linktr.ee/felipe.ponce" },
    ],
    avatar: "/creators/riftbound-felipe.jpg",
    tags: ["Competitive"],
    region: "UK",
    since: "2026-10-22",
  },
  {
    slug: "ramenjuice",
    name: "RamenJuice",
    // His own words, links and email (by email to the owner, 2026-10-25).
    blurb: "Just a simple man with a Riftbound addiction",
    links: [
      { platform: "Instagram", url: "https://www.instagram.com/ramenjuice_rb/", handle: "@ramenjuice_rb" },
      { platform: "YouTube", url: "https://www.youtube.com/@ramenjuicetcg", handle: "@ramenjuicetcg" },
      { platform: "Email", url: "mailto:mrasiandrewie@gmail.com", handle: "mrasiandrewie@gmail.com" },
    ],
    region: "AU",
    avatar: "/creators/ramenjuice.jpg",
    since: "2026-10-22",
  },
  // Four more, from their Instagram profiles (owner, 2026-10-23).
  {
    slug: "bigbarontcg",
    name: "Big Baron",
    blurb: "Riftbound TCG player and investor.",
    links: [
      { platform: "Instagram", url: "https://www.instagram.com/bigbarontcg/", handle: "@bigbarontcg" },
      { platform: "Website", url: "https://www.whatnot.com/invite/bigbarontrading", handle: "Whatnot: bigbarontrading" },
    ],
    avatar: "/creators/bigbarontcg.jpg",
    tags: ["Investing"],
    since: "2026-10-23",
  },
  {
    slug: "riftrawktcg",
    name: "Lou.Rawk",
    blurb: "Riftbound creator from Seattle.",
    links: [{ platform: "Instagram", url: "https://www.instagram.com/riftrawktcg/", handle: "@riftrawktcg" }],
    avatar: "/creators/riftrawktcg.jpg",
    region: "US",
    since: "2026-10-23",
  },
  {
    slug: "secretnumber",
    name: "Secret Number Riftbound",
    blurb: "Riftbound content from Vancouver.",
    links: [
      { platform: "Instagram", url: "https://www.instagram.com/secretnumberriftbound/", handle: "@secretnumberriftbound" },
      { platform: "Website", url: "https://linktr.ee/secretnumbercards", handle: "linktr.ee/secretnumbercards" },
    ],
    avatar: "/creators/secretnumber.jpg",
    region: "CA",
    since: "2026-10-23",
  },
  {
    slug: "deckdemon",
    name: "Deck Demon",
    blurb: "Helping you win more Riftbound games: tips, meta, RQ clips and strategy.",
    links: [
      { platform: "Instagram", url: "https://www.instagram.com/deckdemon_/", handle: "@deckdemon_" },
      { platform: "Website", url: "https://deckdemon.com", handle: "deckdemon.com" },
    ],
    avatar: "/creators/deckdemon.jpg",
    tags: ["Strategy", "Competitive"],
    since: "2026-10-23",
  },
  // Offered a profile, free Premium, a 20% creator code and a Reels cross-promo
  // (owner, 2026-10-30). Not yet replied: only his Instagram handle is known, so
  // nothing else is filled in. Hidden until `status` is "confirmed".
  {
    status: "pending",
    slug: "runeterrabound",
    // TODO: his display name as he gives it; "Runeterra Bound" is a placeholder from the offer.
    name: "Runeterra Bound",
    // TODO: his own one-line bio. Required before confirming (tests/creators-pending.test.ts).
    blurb: "",
    links: [{ platform: "Instagram", url: "https://www.instagram.com/runeterrabound/", handle: "@runeterrabound" }],
    // TODO: any other links he sends (YouTube, TikTok...), and a tipUrl if he has one.
    // TODO: avatar: "/creators/runeterrabound.jpg", a square image HE sends (never one taken from Instagram).
    // TODO: code: set by its Affiliate row in /admin/affiliates (attachCreatorCodes), nothing to type here.
    // TODO: since: the date he goes live, when confirmed.
    since: "2026-10-30",
  },
];

/** Whether a creator is shown on the site: everyone except a pending entry. */
export function isListedCreator(c: Creator): boolean {
  return c.status !== "pending";
}

/** The creators the site shows. Every page and route reads this, never ALL_CREATORS. */
export const CREATORS: Creator[] = ALL_CREATORS.filter(isListedCreator);

// ── Creator of the week: a random weekly rotation (owner, 2026-10-24) ─────────
// "they should rotate every week on a Wednesday … just make it like rotate
// randomly". DECISIONS.md, "Creator of the week rotates every Wednesday".
//
// The week turns at 00:00 on Wednesday, Sydney time (the owner's clock). Within
// each cycle of N weeks (N creators) the order is a seeded shuffle, so the pick
// looks random but everyone gets a week before anyone gets a second, the same
// creator never runs two weeks in a row, and every server agrees on the pick
// with no stored state. A creator added mid-cycle reshuffles that cycle.
// /creators re-renders daily (revalidate 86400), so the new pick shows within a
// day of the turn.
export const ROTATION_TIME_ZONE = "Australia/Sydney";
// A Wednesday: week 0 of the rotation.
const ROTATION_EPOCH_DAY = Date.UTC(2026, 9, 21) / 86_400_000;

/** Days since 1970-01-01 of the calendar date it is in `timeZone` at `now`. */
function localDayNumber(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000;
}

/** Whole Wednesday-to-Wednesday weeks since the rotation began, in Sydney time. */
export function rotationWeek(now: Date = new Date()): number {
  return Math.floor((localDayNumber(now, ROTATION_TIME_ZONE) - ROTATION_EPOCH_DAY) / 7);
}

// A small seeded PRNG (mulberry32), so a shuffle is the same on every server.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cycleOrder(slugs: readonly string[], cycle: number): string[] {
  const order = [...slugs].sort();
  const rand = seeded(cycle * 2654435761 + 12345);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The slug of the creator of the week `week` (rotationWeek()), or null with no creators. */
export function creatorOfTheWeek(slugs: readonly string[], week: number): string | null {
  const n = slugs.length;
  if (!n) return null;
  if (n === 1) return slugs[0];
  const cycle = Math.floor(week / n);
  const pos = week - cycle * n;
  const order = cycleOrder(slugs, cycle);
  // No back-to-back weeks across a cycle boundary: if this cycle would open with
  // the creator who closed the last one, swap its first two.
  const prevLast = cycleOrder(slugs, cycle - 1)[n - 1];
  if (order[0] === prevLast) [order[0], order[1]] = [order[1], order[0]];
  return order[pos];
}

/** Creator of the week (this week's rotation) first, then newest listing first. */
export function featuredCreators(list: readonly Creator[] = CREATORS, now: Date = new Date()): Creator[] {
  const pick = creatorOfTheWeek(
    list.map((c) => c.slug),
    rotationWeek(now),
  );
  return list
    .map((c) => ({ ...c, ofTheWeek: c.slug === pick }))
    .sort((a, b) => Number(b.ofTheWeek) - Number(a.ofTheWeek) || b.since.localeCompare(a.since));
}

// ── Creator codes, matched from the Affiliate table (owner, 2026-10-24) ──────
// "a lot of the creators have creator codes. We probably should put their codes
// on the creators page as well". Codes are made in /admin/affiliates and live in
// the database, so /creators reads the ACTIVE ones (code, name and discount only;
// lib/content/creators-server.ts) and attaches each to the creator it belongs to.
// A code matches a creator when the affiliate's name, or the code minus its
// trailing digits ("KEISHUN20" → "keishun"), equals the creator's slug, name or
// one of their handles, ignoring case and punctuation. Ambiguity shows nothing:
// a code that would match two creators, or a creator two codes would match, is
// left off rather than guessed. A `code` typed on a creator above always wins.
export interface ActiveCode {
  code: string;
  name: string;
  percentOff: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function creatorKeys(c: Creator): Set<string> {
  const keys = [c.slug, c.name, ...c.links.map((l) => l.handle ?? "")].map(norm).filter((k) => k.length >= 3);
  return new Set(keys);
}

function codeKeys(a: ActiveCode): string[] {
  return [norm(a.name), norm(a.code.replace(/\d+$/, ""))].filter((k) => k.length >= 3);
}

export function attachCreatorCodes(list: readonly Creator[], codes: readonly ActiveCode[]): Creator[] {
  const keys = list.map(creatorKeys);
  const owners = codes.map((a) => {
    const ak = codeKeys(a);
    return list.map((_, i) => i).filter((i) => ak.some((k) => keys[i].has(k)));
  });
  return list.map((c, i) => {
    if (c.code) return c;
    const mine = codes.filter((_, j) => owners[j].length === 1 && owners[j][0] === i);
    return mine.length === 1 ? { ...c, code: { code: mine[0].code, percentOff: mine[0].percentOff } } : c;
  });
}

export const PLATFORM_STYLE: Record<CreatorPlatform, { bg: string; fg: string }> = {
  YouTube: { bg: "#ff0033", fg: "#ffffff" },
  Twitch: { bg: "#9146ff", fg: "#ffffff" },
  TikTok: { bg: "#111111", fg: "#ffffff" },
  Instagram: { bg: "#e1306c", fg: "#ffffff" },
  X: { bg: "#000000", fg: "#ffffff" },
  Discord: { bg: "#5865f2", fg: "#ffffff" },
  Website: { bg: "#334155", fg: "#ffffff" },
  Email: { bg: "#0f766e", fg: "#ffffff" },
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
