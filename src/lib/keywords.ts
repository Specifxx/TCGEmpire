// Riftbound keyword/mechanic reference pages (/keywords, /keywords/[slug]).
//
// WHY THIS EXISTS: riftbound.gg shipped a single /glossary page (25 keywords +
// game actions) on 2026-07-18 and it now outranks us for "riftbound empower" —
// a query we used to lead on. A single glossary page can't do what a dedicated
// page per keyword can: a direct answer, worked examples with real card images,
// edge-case rulings, a live "every card with this keyword" list, and FAQPage
// schema built from the actual long-tail people search.
//
// DATA-ACCURACY RULE (do not relax this): rules text below is ported verbatim
// (or lightly reformatted) from src/lib/articles.ts's existing Empower/Flow/Burn
// guides — content already published on site, itself sourced against Riot's own
// Core Rules (see the "Empowered is a status" section). It is NOT freshly
// drafted from memory. Riftbound has ~30 keywords in total (see ALL_KEYWORD_NAMES
// below, taken from the competitive audit that flagged this gap); we do not hold
// verified official rules text for the other ~27 (Deathknell, Reaction, Tank,
// Ambush, Stun, Hidden, etc.) anywhere in this repo. DO NOT draft entries for
// them from general knowledge — get the source text (Riot's Comprehensive Rules
// PDF/URL, or an explicit sign-off) first. Listing a name in ALL_KEYWORD_NAMES is
// just cataloguing a real printed term; it is not a claim about what it does.

export interface KeywordFaq {
  q: string;
  a: string;
}

export interface KeywordSection {
  heading: string;
  body: string; // one or more paragraphs, markdown-lite (supports [text](/href))
}

export interface KeywordEntry {
  slug: string; // "empower"
  name: string; // "Empower"
  set: string; // set that introduced it, for scoping the live card query
  rulesContain: string; // printed bracket marker, e.g. "[Empower]" — same predicate
  // the existing guide's browseCta/embed already use, so this page and the guide
  // always show the identical set of cards.
  directAnswer: string; // ~50-80 words, answers "what is <keyword>" up front
  sections: KeywordSection[];
  faqs: KeywordFaq[];
  guideSlug: string; // cross-link to the matching /guides/* tutorial
  relatedKeywords: string[]; // sibling keyword slugs
}

export const KEYWORDS: KeywordEntry[] = [
  {
    slug: "empower",
    name: "Empower",
    set: "VEN",
    rulesContain: "[Empower]",
    directAnswer:
      "Empower is a Riftbound: Vendetta keyword that gives a card the potential to gain new abilities once it's already in play — usually by paying an additional cost on a later turn. An Empower card can be played cheaply now and \"levelled up\" afterwards, adding might, an effect, or a new keyword. It's a two-stage card: a body now, its full power later.",
    sections: [
      {
        heading: "How Empower works, step by step",
        body: "1. Play the card normally — it enters as a modest, often cheap unit or permanent.\n2. Bank your energy for a later turn where you can afford the Empower cost.\n3. Empower it — pay the cost shown in brackets to trigger the upgrade: bigger stats, a new ability, or an on-board effect.\n4. Repeat where the card allows — some Empower cards are designed to keep scaling.",
      },
      {
        heading: "Empowered is a status, and Disempower removes it",
        body: "Riot's own Core Rules confirm exactly how this works under the hood: Empowered is a status that sticks to a card indefinitely — it does nothing by itself, but other abilities can check for it (that's the Empowered keyword: a dependent ability that only turns on while the card has the status). A card stays Empowered until it leaves the board, or until something Disempowers it — the exact reverse of Empower, removing the status outright. You can't Disempower a card that isn't Empowered in the first place, and some Vendetta cards use \"disempower a card\" as their own cost or instruction.",
      },
      {
        heading: "Building an Empower deck",
        body: "Empower leans toward Mind and Body styles of play — champions like Jayce and Mel who want to bank resources and go over the top later. Curve for the double-spend (leave room to both play and Empower in the same few turns), protect the payoff (hold up an answer before you commit the upgrade), and don't over-Empower a single unit when a second body would win faster. See the [best Vendetta decks guide](/guides/best-riftbound-vendetta-decks) for full archetype breakdowns.",
      },
    ],
    faqs: [
      { q: "What is Empower in Riftbound?", a: "Empower gives a card the potential to gain new abilities once it's already in play, usually by paying an extra cost on a later turn — a cheap play now, a bigger payoff later." },
      { q: "Is Empower permanent?", a: "Yes. Empowered is a status that sticks to a card indefinitely — it lasts until the card leaves the board, or until something Disempowers it." },
      { q: "What is Disempower?", a: "The reverse of Empower — an instruction or cost on some cards that strips the Empowered status from a card, turning off whatever effect its Empowered ability was granting. You can't Disempower a card that isn't currently Empowered." },
      { q: "When can you Empower a card?", a: "On a later turn, once you can afford the bracketed activation cost printed on the card — there's no requirement to do it the turn the card enters play." },
      { q: "Is Empower the same as levelling up a champion?", a: "No — Empower is a general mechanic that upgrades any card in play by paying a cost, not a champion-only level system." },
      { q: "How is Empower different from Flow and Burn?", a: "Empower grows a card you already control; Flow plays cards from your trash; Burn sends cards to the trash. All three are new in Vendetta and designed to combo." },
    ],
    guideSlug: "riftbound-empower-explained",
    relatedKeywords: ["flow", "burn"],
  },
  {
    slug: "flow",
    name: "Flow",
    set: "VEN",
    rulesContain: "[Flow]",
    directAnswer:
      "Flow is a Riftbound: Vendetta keyword that lets you play a card from your trash instead of from your hand. Cards you've used, discarded or had destroyed aren't gone — with Flow, they become a second pool of plays, often for their normal or a modified cost.",
    sections: [
      {
        heading: "How the Flow mechanic works",
        body: "Your trash is a second hand: a card with Flow can be cast straight out of the trash, often for its normal or a modified cost. Fill the trash on purpose — the more cards in your trash, the more Flow options you have, so effects that discard, cycle or Burn your own deck actively help a Flow deck. Flow rewards players who track what's in the trash and sequence replays for maximum value.",
      },
      {
        heading: "Building a Flow deck",
        body: "Flow is the recursion engine of Vendetta. Its best partner is Burn, which stocks your trash quickly — Burn fills it, Flow cashes it in. Include cheap ways to get cards into the trash early so Flow is online when you need it, plan for longer grindy games rather than racing, and watch for effects that exile or shuffle away the trash. See how Flow fits full decklists in the [best Vendetta decks guide](/guides/best-riftbound-vendetta-decks).",
      },
    ],
    faqs: [
      { q: "What is Flow in Riftbound?", a: "Flow is a Vendetta keyword that lets you play a card straight from your trash instead of your hand — your discarded and used cards become a second pool of plays rather than being gone for good." },
      { q: "How does the Flow mechanic work?", a: "A card printed with Flow can be cast from the trash the same way you'd cast it from hand, often for its normal cost — so anything that fills your trash first (discarding, cycling, or the Burn mechanic) sets Flow up to cash in later." },
      { q: "Is Flow only in Vendetta?", a: "Yes — Flow is introduced as a brand-new keyword in the Vendetta set; it doesn't appear on cards from earlier sets." },
      { q: "How is Flow different from Empower and Burn?", a: "Flow plays cards from your trash; Burn sends cards to your trash; Empower upgrades a card that's already in play." },
    ],
    guideSlug: "riftbound-flow-explained",
    relatedKeywords: ["burn", "empower"],
  },
  {
    slug: "burn",
    name: "Burn",
    set: "VEN",
    rulesContain: "[Burn]",
    directAnswer:
      "Burn is a Riftbound: Vendetta keyword that sends cards from a Main Deck to the trash. Self-Burn sends cards from your own deck — the fastest way to stock your trash for Flow and other trash-payoffs. Deck-attack Burn instead mills your opponent's deck, chipping away at what they'll draw.",
    sections: [
      {
        heading: "Self-Burn vs deck attack (mill)",
        body: "Self-Burn sends cards from your own deck to the trash — that sounds bad, but it's the fastest way to stock your trash for Flow and other trash-payoffs. Deck-attack Burn instead burns your opponent's deck, Riftbound's take on a mill strategy: chipping away at what they'll draw rather than what's on the board.",
      },
      {
        heading: "How to build with Burn",
        body: "As fuel: pair self-Burn with Flow — Burn fills the trash, Flow replays from it, the core value engine of the set. As a clock: lean into opponent-Burn to win by decking them out, but check how fast that clock actually is before committing to it as your only win condition. Mind the downside: self-Burn thins your own deck, so make sure you're getting more value back than you lose. Full decklists that use Burn are in the [best Vendetta decks guide](/guides/best-riftbound-vendetta-decks).",
      },
    ],
    faqs: [
      { q: "What is Burn in Riftbound?", a: "Burn sends cards from a Main Deck to the trash — either your own (self-Burn, to fuel Flow and other trash-payoffs) or your opponent's (a mill-style deck attack)." },
      { q: "Is Burn the same as mill?", a: "Deck-attack Burn (burning an opponent's deck) is Riftbound's version of a mill strategy. Self-Burn is a different use of the same keyword — filling your own trash on purpose." },
      { q: "Is Burn only in Vendetta?", a: "Yes — Burn is introduced as a new keyword in the Vendetta set." },
      { q: "How is Burn different from Flow and Empower?", a: "Burn sends cards to the trash; Flow plays them back out of the trash; Empower grows a card that's already in play. The three are designed to combo." },
    ],
    guideSlug: "riftbound-burn-explained",
    relatedKeywords: ["flow", "empower"],
  },
];

export const keywordBySlug = (slug: string): KeywordEntry | undefined =>
  KEYWORDS.find((k) => k.slug === slug.toLowerCase());

// Full name catalogue for the /keywords hub's "one-page glossary" view — sourced
// from a competitive audit of riftbound.gg's glossary and runeweave.com's facet
// list, i.e. real printed Riftbound keyword names. Only the slugs present in
// KEYWORDS above have verified rules text and a live page; the rest are listed
// (so the hub is a complete index) but not linked, pending source rules text —
// see the file-header note. Do not add rules copy here without a verified source.
export const ALL_KEYWORD_NAMES: string[] = [
  "Empower", "Disempower", "Flow", "Burn",
  "Deflect", "Deathknell", "Reaction", "Action", "Equip", "Hidden", "Ganking",
  "Accelerate", "Repeat", "Tank", "Assault", "Shield", "Ambush", "Vision",
  "Legion", "Weaponmaster", "Hunt", "Level", "Stun", "Predict", "Backline",
  "Buff", "Temporary", "Mighty", "Unique", "Add",
];

export const keywordSlug = (name: string): string => name.toLowerCase();
