// Curated directory of THIRD-PARTY Riftbound resources — hand-maintained, same
// convention as creators.ts and constants.ts's SETS: no database table, no
// admin UI, just an array a PR edits. Powers /community.
//
// WHY THIS EXISTS: the owner asked for a "community" section modelled on sites
// like QuickRift — a directory of external community content (news, wikis,
// deck builders, tier lists, video) rather than more of RiftCompare's own
// writing. This is NOT /creators: that page is about RiftCompare's own social
// channels and paid/promotional creator PARTNERSHIPS (see its own file header
// on why that word is reserved). This page has no commercial relationship
// with anything listed here — it is a plain, unpaid directory, the same way a
// "further reading" list works.
//
// EVERY ENTRY MUST BE VERIFIED, NOT GUESSED. Each url below was found via a
// live web search on 2026-09-15 and, where fetchable, confirmed live. Several
// of these are direct competitors (deck builders, card databases, tier
// lists) — listed anyway, deliberately: a resource hub that only linked to
// things that don't compete with us would be a worse hub, and a visitor who
// notices the omission trusts the rest of the list less. `description` is a
// short, factual paraphrase of what the site says about itself, not a review
// or endorsement.
//
// NO FABRICATED DATES. Unlike lib/articles.ts / lib/posts.ts, these are pages
// we do not control and cannot honestly timestamp — we don't reliably know
// when a given tier list or wiki page last changed. There is deliberately no
// `date` field and no "New" badge here; see FilterableArticles.tsx's own
// comment on why a fabricated freshness signal is worse than none.
//
// HOW TO ADD ONE: confirm the URL is live and the description is accurate,
// then append below in the category it best fits. Do not add a specific
// article/video URL you have not personally verified resolves and says what
// you're about to claim it says.
export interface CommunityResource {
  /** Display name of the site/creator, not the page title of one article. */
  source: string;
  url: string;
  /** One factual sentence — what it is / what you'll find there. No hype. */
  description: string;
  category: "News, Wikis & Databases" | "Deck Builders & Simulators" | "Meta & Tier Lists" | "Video";
}

export const COMMUNITY_RESOURCES: CommunityResource[] = [
  // ── News, Wikis & Databases ────────────────────────────────────────────────
  {
    source: "Riftbound (Official)",
    url: "https://playriftbound.com/",
    description: "Riot Games' official site — set announcements, the rules hub and organized-play updates straight from the publisher.",
    category: "News, Wikis & Databases",
  },
  {
    source: "riftbound.gg",
    url: "https://riftbound.gg/",
    description: "A large community-run hub: rules wiki, glossary, card reveals, a deck builder and weekly metagame reports.",
    category: "News, Wikis & Databases",
  },
  {
    source: "Piltover Archive",
    url: "https://piltoverarchive.com/",
    description: "A community-built card database, deck builder and meta companion, with card browsing, proxies and news.",
    category: "News, Wikis & Databases",
  },
  {
    source: "Riftbound.one",
    url: "https://www.riftbound.one/",
    description: "A card database with rules-text search, TCGplayer pricing and tournament decklists.",
    category: "News, Wikis & Databases",
  },
  {
    source: "Riftbound TCG Wiki",
    url: "https://riftboundtcg.wiki/",
    description: "A community wiki covering rules, deckbuilding fundamentals and set-by-set guides.",
    category: "News, Wikis & Databases",
  },

  // ── Deck Builders & Simulators ───────────────────────────────────────────────
  {
    source: "QuickRift",
    url: "https://quickrift.app/",
    description: "A free browser deck builder and online simulator — build a list, practise solo, then play real 1v1, 2v2 or free-for-all matches.",
    category: "Deck Builders & Simulators",
  },
  {
    source: "Rift Mana",
    url: "https://riftmana.com/",
    description: "A deck builder with an active companion Discord community.",
    category: "Deck Builders & Simulators",
  },

  // ── Meta & Tier Lists ────────────────────────────────────────────────────────
  {
    source: "Riftbound Zone",
    url: "https://riftbound.zone/en/",
    description: "Tournament coverage, a meta tier list, daily card prices and player leaderboards.",
    category: "Meta & Tier Lists",
  },
  {
    source: "Riftools",
    url: "https://www.riftools.app/meta/tier-list",
    description: "Meta tier lists built from tournament finishes, decklist counts and average placement rather than opinion.",
    category: "Meta & Tier Lists",
  },
  {
    source: "riftDecks.com",
    url: "https://riftdecks.com/legends",
    description: "A regularly-updated tier list of the top-performing Legends in the current meta.",
    category: "Meta & Tier Lists",
  },
  {
    source: "Riftbound Meta by LotharHS",
    url: "https://riftmeta.net/",
    description: "A deck tier list and power-vs-complexity matrix maintained by content creator LotharHS.",
    category: "Meta & Tier Lists",
  },

  // ── Video ────────────────────────────────────────────────────────────────────
  {
    source: "RiftTube",
    url: "https://rifttube.com/",
    description: "An index of Riftbound YouTube videos, filterable by set, Legend, domain and content type.",
    category: "Video",
  },
];
