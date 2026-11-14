// Riftbound's ban lists, as data. DECISIONS.md, "Search snippets: answers in
// the title, from data", 2026-09-24.
//
// The ban-list guide used to hold this only as prose and three embed slug
// lists, so the one thing "riftbound ban list" searchers want — which cards,
// which format, since when — was not a table, not countable and not in
// structured data (0.2% CTR on 8,720 impressions). One list now feeds the
// table under the H1, the "N cards banned" line and the ItemList JSON-LD.
//
// Sources: Riot's ban announcements of 31 March, 17 July (effective 24 July),
// 15 September (effective 18 September) and 13 November (effective 23
// November) 2026. A row whose date is still ahead reads "from", not "since"
// (banIsUpcoming): the November wave was announced ten days before it applied. When Riot bans a card, add a
// row here AND bump BANLIST_UPDATED to the announcement date.

export const BANLIST_UPDATED = "2026-11-13";
export const BANLIST_SLUG = "riftbound-banlist-explained";

export type BanFormat = "Standard" | "2v2";

export interface BannedCard {
  name: string;
  /** The card page to link and price. For a card with alt-art printings, the base one. */
  slug: string;
  formats: BanFormat[];
  /** Date the ban took effect (ISO). */
  effective: string;
}

const BOTH: BanFormat[] = ["Standard", "2v2"];

// Newest first, matching the guide's own section order. The 2v2 list started
// (July 2026) as the whole Standard list plus Master Yi, so every Standard ban
// is also a 2v2 ban.
export const BANNED_CARDS: BannedCard[] = [
  { name: "Riven, Broken Blade", slug: "riven-broken-blade-rad-043-167", formats: BOTH, effective: "2026-11-23" },
  { name: "Zhonya's Hourglass", slug: "zhonya-s-hourglass-ogn-077-298", formats: BOTH, effective: "2026-11-23" },
  { name: "Stellacorn Herder", slug: "stellacorn-herder-sfd-048-221", formats: BOTH, effective: "2026-11-23" },
  { name: "Nocturne, Horrifying", slug: "nocturne-horrifying-ogn-194-298", formats: BOTH, effective: "2026-11-23" },
  { name: "Rhasa the Sunderer", slug: "rhasa-the-sunderer-ogn-195-298", formats: BOTH, effective: "2026-11-23" },
  { name: "Brynhir Thundersong", slug: "brynhir-thundersong-ogn-026-298", formats: BOTH, effective: "2026-11-23" },
  { name: "Dazzling Aurora", slug: "dazzling-aurora-ogn-160-298", formats: BOTH, effective: "2026-11-23" },
  { name: "Baited Hook", slug: "baited-hook-ogn-242-298", formats: BOTH, effective: "2026-11-23" },
  { name: "Emperor's Dais", slug: "emperor-s-dais-sfd-207-221", formats: BOTH, effective: "2026-11-23" },
  { name: "Star Spring", slug: "star-spring-unl-215-219", formats: BOTH, effective: "2026-11-23" },
  { name: "Ekko, Recurrent", slug: "ekko-recurrent-ogn-110-298", formats: BOTH, effective: "2026-09-18" },
  { name: "Stacked Deck", slug: "stacked-deck-ogn-183-298", formats: BOTH, effective: "2026-09-18" },
  { name: "Stealthy Pursuer", slug: "stealthy-pursuer-ogn-177-298", formats: BOTH, effective: "2026-07-24" },
  { name: "The Arena's Greatest", slug: "the-arena-s-greatest-ogn-290-298", formats: BOTH, effective: "2026-07-24" },
  { name: "Aspirant's Climb", slug: "aspirant-s-climb-ogn-276-298", formats: BOTH, effective: "2026-07-24" },
  { name: "Master Yi, Wuju Bladesman", slug: "master-yi-wuju-bladesman-ogs-019-024", formats: ["2v2"], effective: "2026-07-24" },
  { name: "Scrapheap", slug: "scrapheap-ogn-182-298", formats: BOTH, effective: "2026-03-31" },
  { name: "Called Shot", slug: "called-shot-sfd-122-221", formats: BOTH, effective: "2026-03-31" },
  { name: "Draven, Vanquisher", slug: "draven-vanquisher-sfd-020-221", formats: BOTH, effective: "2026-03-31" },
  { name: "Reaver's Row", slug: "reaver-s-row-ogn-285-298", formats: BOTH, effective: "2026-03-31" },
  { name: "Fight or Flight", slug: "fight-or-flight-ogn-168-298", formats: BOTH, effective: "2026-03-31" },
  { name: "The Dreaming Tree", slug: "the-dreaming-tree-ogn-292-298", formats: BOTH, effective: "2026-03-31" },
  { name: "Obelisk of Power", slug: "obelisk-of-power-ogn-284-298", formats: BOTH, effective: "2026-03-31" },
];

/** "15 Sep 2026" */
export function banDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** True while a ban has been announced but is not in force yet. */
export function banIsUpcoming(ban: BannedCard, now: Date = new Date()): boolean {
  return now.getTime() < new Date(`${ban.effective}T00:00:00Z`).getTime();
}

/** The guide every ban notice links to. */
export const BANLIST_HREF = `/guides/${BANLIST_SLUG}`;

/**
 * The ban that applies to a card, or null (2026-10-02, card pages and the
 * quick view). Matched by NAME, not slug: a ban covers every printing of the
 * card (alt arts, Signatures, promos), and the table lists only the base one.
 */
export function banFor(name: string): BannedCard | null {
  const key = name.trim().toLowerCase();
  return BANNED_CARDS.find((b) => b.name.toLowerCase() === key) ?? null;
}
