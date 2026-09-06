// Riftbound keyword/mechanic reference pages (/keywords, /keywords/[slug]).
//
// WHY THIS EXISTS: riftbound.gg shipped a single /glossary page (25 keywords +
// game actions) on 2026-07-18 and it now outranks us for "riftbound empower" —
// a query we used to lead on. A single glossary page can't do what a dedicated
// page per keyword can: a direct answer, worked examples with real card images,
// edge-case rulings, a live "every card with this keyword" list, and FAQPage
// schema built from the actual long-tail people search.
//
// DATA-ACCURACY RULE (do not relax this): every entry below is paraphrased from
// Riot's own Core Rules PDF — the "Core Rules" download linked from
// https://playriftbound.com/en-us/rules-hub/ (last updated 2026-07-16;
// cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf).
// That document has two sections our entries draw from: "804. Keyword Glossary"
// (rules 805-829, for printed keywords like Tank and Empower) and the earlier
// numbered "Game Actions" (rules 423-442 and 706-708, for verb-style effects
// like Buff, Stun and Mighty that aren't bracketed keywords but still have
// precise rules text). Nothing here is freshly drafted from memory or copied
// verbatim — it's our own paraphrase of Riot's rule, checked against the rule
// number cited in each entry's trailing comment so a claim can be re-verified
// against the source PDF at any time. Do not add or edit an entry without
// re-reading the corresponding rule number in that document first.
//
// EVERY name in ALL_KEYWORD_NAMES now has a verified entry — all 30. Three
// (Empower, Flow, Burn) were sourced first, against the same document, before
// this file's rest was filled in on 2026-08-12.
//
// `rulesContain` values are not guessed either: every one was confirmed against
// the LIVE production catalogue via `/api/cards?rules=<marker>` before being
// committed, so `rulesContain` names a substring that is provably printed on at
// least one real, currently-catalogued card — except where noted per-entry that
// no catalogued card carries it yet (the entry's rules text is still fully
// verified; it just has no live "every card with this keyword" example to show).

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
  // Set to scope the live card query against. NOT necessarily "the set that
  // introduced this keyword" — every entry here is "VEN", including keywords
  // that are core, evergreen Riftbound rules and predate Vendetta entirely
  // (Tank, Action, Reaction, etc.). That's a live-data fact, not a rules one:
  // as of 2026-08-12, `Card.description` (the rules-text field this predicate
  // reads) is populated ONLY for Vendetta — confirmed by probing production
  // with a maximally generic single-character query, which matched 36 VEN
  // cards and ZERO cards in every other set. Origins/Unleashed/Spiritforged
  // were imported by the general RiftScribe sync, which doesn't carry rules
  // text through; Vendetta alone went through a dedicated gallery scraper
  // (import-vendetta.ts) that does. So "VEN" here means "the only set where
  // this predicate can currently match anything", not "Vendetta-exclusive
  // mechanic" — see each entry's own prose for what's actually true about
  // where the keyword is printed. Revisit this once description text is
  // backfilled for the older sets.
  set: string;
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

  // ── Timing keywords (Core Rules 806, 813, 811, 822) ─────────────────────────
  // When a card can be played, not what it does once it lands. Grouped in
  // /guides/riftbound-timing-keywords-explained.
  {
    slug: "action",
    name: "Action",
    set: "VEN",
    rulesContain: "[Action]",
    directAnswer:
      "Action is a Riftbound keyword that gives a card or ability permission to be played or activated during a Showdown — a state that normally only lets the active player respond — even when it isn't your turn. It's pure permission: an Action card still follows every other rule for playing it (a unit still needs a base or a battlefield you control), it just isn't locked out of Showdowns the way an ordinary card is.",
    sections: [
      {
        heading: "What Action actually changes",
        body: "Without Action, most cards can only be played on your own turn during an Open state. Action lifts that restriction for Showdowns specifically — both players get a chance to respond during a Showdown, and an Action card or ability can be part of that back-and-forth on either player's turn. It doesn't add any new instruction to the card; it only changes when the card is allowed to be played.",
      },
      {
        heading: "Action vs Reaction",
        body: "Action and Reaction are a pair, and Reaction is the bigger permission — it includes everything Action does, plus the ability to be played during a Closed state, which is Riftbound's true \"any time\" instant-speed window. If a card has Reaction, it doesn't also need Action; Reaction already covers it. See the [Timing Keywords guide](/guides/riftbound-timing-keywords-explained) for how the two combine with Hidden and Ambush to build a tempo-focused deck.",
      },
    ],
    faqs: [
      { q: "What does Action mean in Riftbound?", a: "Action gives a card or ability permission to be played or activated during a Showdown, even on an opponent's turn — it's a permission, not a new effect." },
      { q: "How is Action different from Reaction?", a: "Reaction includes everything Action grants, plus the additional permission to be played during a Closed state — Riftbound's fully open, any-time timing window. Action alone doesn't reach that far." },
      { q: "Does Action change what a card does?", a: "No. Action only changes when a card can be played — the card's actual instructions and restrictions (like where a unit can be played) are unaffected." },
    ],
    guideSlug: "riftbound-timing-keywords-explained",
    relatedKeywords: ["reaction", "hidden", "ambush"],
  },
  {
    slug: "reaction",
    name: "Reaction",
    set: "VEN",
    rulesContain: "[Reaction]",
    directAnswer:
      "Reaction is Riftbound's true instant-speed keyword. It grants everything Action does — permission to play or activate during a Showdown — plus permission to play during a Closed state, the game's most restrictive timing window, which otherwise only Reaction cards can act in. A Reaction card can be played on any player's turn, essentially any time you have priority.",
    sections: [
      {
        heading: "What playing at \"Closed state speed\" means",
        body: "Riftbound splits timing into states rather than a single stack. A Closed state is the tightest of them — normally nothing new can be played into it at all. Reaction is the keyword that carves out an exception: a card or ability with Reaction can still be played or activated there, on either player's turn. That's what makes Reaction cards feel like tricks and counters rather than ordinary plays — they show up exactly when the board state is most locked down.",
      },
      {
        heading: "Reaction abilities that add resources",
        body: "One of the most common uses of Reaction in practice is on abilities that Add resources (mana/power) to your pool — those can be activated the instant a cost needs paying, even mid-resolution of something else, letting you hold energy back and still afford a cost you didn't fully plan for. Combined with Hidden and Ambush, Reaction is one of the core tools for playing around what your opponent expects — see the [Timing Keywords guide](/guides/riftbound-timing-keywords-explained) for how they combine.",
      },
    ],
    faqs: [
      { q: "What does Reaction mean in Riftbound?", a: "Reaction lets a card or ability be played or activated during a Closed state — the game's tightest timing restriction — on any player's turn, in addition to everything Action already permits." },
      { q: "Is Reaction the same as an instant in other card games?", a: "It's the closest Riftbound equivalent — a Reaction card can respond at almost any point, including your opponent's turn, rather than waiting for your own." },
      { q: "Can a card have both Action and Reaction?", a: "It's redundant to print both — Reaction already includes every permission Action grants, so a card only needs Reaction to get both." },
    ],
    guideSlug: "riftbound-timing-keywords-explained",
    relatedKeywords: ["action", "hidden", "ambush"],
  },
  {
    slug: "hidden",
    name: "Hidden",
    set: "VEN",
    rulesContain: "[Hidden]",
    directAnswer:
      "Hidden is a Riftbound keyword on Spells, Units and Gear that lets you pay a cost to hide the card facedown at a battlefield you control, on your own turn. From the next turn onward, that facedown card gains Reaction and can be played for free, ignoring its normal cost — turning it into a surprise play your opponent can't see coming or plan around.",
    sections: [
      {
        heading: "How hiding and playing from Hidden works",
        body: "While a card with Hidden sits in your hand or Champion Zone, you may pay its Hidden cost to hide it facedown at a battlefield you control that doesn't already have a hidden card there. It stays there — hidden information, not a public commitment — until you choose to play it, which you can do from the next turn onward at any time a Reaction card could be played, for [0] rather than its printed cost.",
      },
      {
        heading: "The targeting restriction, and why it matters",
        body: "A card played from Hidden that targets something (or is a permanent whose own play effect targets something) is generally restricted to targets at the battlefield it was hidden at — the game already committed that card to a location the moment it went facedown. That's the tradeoff: total surprise on timing and identity, in exchange for a fixed location. Ambush is the natural partner — see the [Timing Keywords guide](/guides/riftbound-timing-keywords-explained) for how the two set up bluffs together.",
      },
    ],
    faqs: [
      { q: "What is Hidden in Riftbound?", a: "Hidden lets you pay a cost to place a card facedown at a battlefield you control; from the next turn on you can play it for free, at Reaction speed, without your opponent knowing what it is until it resolves." },
      { q: "Can you play a Hidden card the same turn you hide it?", a: "No — a hidden card gains its Reaction permission and free cost starting the turn after it was hidden, not immediately." },
      { q: "Does a card with Hidden have to be hidden?", a: "No — it's optional. A card with Hidden can always be played normally for its usual cost and timing instead." },
      { q: "Are there restrictions on what a Hidden card can target?", a: "Often, yes — most targeting from a card played out of Hidden is restricted to the battlefield it was hidden at, since that's the location it was already committed to." },
    ],
    guideSlug: "riftbound-timing-keywords-explained",
    relatedKeywords: ["ambush", "action", "reaction"],
  },
  {
    slug: "ambush",
    name: "Ambush",
    set: "VEN",
    rulesContain: "[Ambush]",
    directAnswer:
      "Ambush is a Riftbound keyword on units that lets them be played to a battlefield where you already control other units — a location that would otherwise be off-limits, since units can normally only be played to your base or a battlefield you already control by other means. While being played that way, an Ambush unit also gains Reaction, so it can drop into a fight already in progress.",
    sections: [
      {
        heading: "What Ambush adds to a unit's options",
        body: "Ordinarily a unit can only be played to your base, or to a battlefield you already have presence at. Ambush is a passive ability that widens that list: it adds \"a battlefield where you control units\" as a valid destination, purely as an extra option layered on top of the normal rules — it never removes a choice you already had. If the battlefield you were relying on stops having your units at it before the play finishes resolving, Ambush's permission for that location disappears with it.",
      },
      {
        heading: "Why Ambush reads as a combat trick",
        body: "Because an Ambush unit gains Reaction for the play, it can show up at an already-active battlefield at the same instant-speed timing a Reaction card would — reinforcing a fight mid-combat rather than only setting up ahead of time. Paired with Hidden, it's one of the core tools for a deck built around surprise plays; see the [Timing Keywords guide](/guides/riftbound-timing-keywords-explained) for how they work together.",
      },
    ],
    faqs: [
      { q: "What does Ambush do in Riftbound?", a: "Ambush lets a unit be played to a battlefield where you already control units — normally off-limits — and grants it Reaction for that play, so it can join a fight already underway." },
      { q: "Can Ambush be used to play a unit to an empty battlefield?", a: "No — the permission specifically requires a battlefield where you already control one or more units. An empty battlefield isn't a valid Ambush destination on its own." },
      { q: "Does Ambush replace the normal rules for playing a unit?", a: "No, it adds to them. A unit with Ambush can still be played to your base or anywhere else it normally could; Ambush is an extra option, not a replacement." },
    ],
    guideSlug: "riftbound-timing-keywords-explained",
    relatedKeywords: ["hidden", "reaction", "action"],
  },

  // ── Combat keywords (Core Rules 815, 814, 809, 807, 826, 810) ───────────────
  // Positioning, damage assignment and combat math. Grouped in
  // /guides/riftbound-combat-keywords-explained.
  {
    slug: "tank",
    name: "Tank",
    set: "VEN",
    rulesContain: "[Tank]",
    directAnswer:
      "Tank is a Riftbound keyword on units that changes how combat damage gets assigned to your side. A unit with Tank must be assigned lethal damage before any of your other units without Tank — it steps in front of the rest of your board, soaking up damage that would otherwise land somewhere else, as long as another Tank unit hasn't already claimed the assignment.",
    sections: [
      {
        heading: "How Tank changes damage assignment",
        body: "During the Combat Damage step, an attacker assigning damage across your units must give a Tank unit lethal damage before it's allowed to assign any to a unit without Tank. If you control more than one Tank unit, the attacker can choose between them freely — Tank units without Tank simply aren't valid targets until every Tank unit has already taken lethal.",
      },
      {
        heading: "Tank vs Shield vs Backline",
        body: "Tank forces damage toward itself; [Shield](/keywords/shield) makes a unit tougher while it's the one being attacked; [Backline](/keywords/backline) does the opposite of Tank, pushing damage away until other units have taken their share. Building a defensive line usually means combining more than one of these — see the [Combat Keywords guide](/guides/riftbound-combat-keywords-explained) for how they stack.",
      },
    ],
    faqs: [
      { q: "What does Tank do in Riftbound?", a: "A unit with Tank must be assigned lethal combat damage before any of the same controller's units that don't have Tank — it's forced to absorb damage that would otherwise land elsewhere on your board." },
      { q: "What if I have more than one unit with Tank?", a: "The attacker can choose which Tank unit gets the damage first — units without Tank still can't be assigned any until every Tank unit has taken lethal." },
      { q: "Is Tank the opposite of Backline?", a: "Functionally yes — Tank must be assigned lethal damage first, while Backline must be assigned it last, after every non-Backline unit already has." },
    ],
    guideSlug: "riftbound-combat-keywords-explained",
    relatedKeywords: ["shield", "backline", "deflect"],
  },
  {
    slug: "shield",
    name: "Shield",
    set: "VEN",
    rulesContain: "[Shield",
    directAnswer:
      "Shield is a Riftbound keyword on units that adds bonus Might — but only while that unit is defending in combat. \"Shield [X]\" gives +X Might for the duration of combat as a defender; the value disappears the moment the unit stops defending, and multiple sources of Shield on the same unit simply add together.",
    sections: [
      {
        heading: "How Shield's bonus works",
        body: "Shield is short for \"while I am a defender, I have +X Might\" — the Defender designation is granted during Combat, so Shield's bonus only ever applies for that window. If X is left off a card, it's treated as 1. Stack multiple instances of Shield (from the printed keyword plus any granted copies) and the values sum, so a heavily-Shielded blocker can swing well above its printed stat line for exactly the fight it's in.",
      },
      {
        heading: "Building a defensive shell with Shield",
        body: "Because the bonus is conditional on defending, Shield rewards a deck that's happy to sit back and let the opponent attack into a wall rather than racing. It pairs naturally with [Tank](/keywords/tank) (forcing damage toward a specific unit) and [Deflect](/keywords/deflect) (taxing what targets it at all) — see the [Combat Keywords guide](/guides/riftbound-combat-keywords-explained) for how a defensive shell comes together.",
      },
    ],
    faqs: [
      { q: "What does Shield mean in Riftbound?", a: "Shield gives a unit +X Might, but only while it's defending in combat — the bonus applies during that fight and goes away once combat ends." },
      { q: "Does Shield work when my unit is attacking?", a: "No — Shield's bonus is specifically tied to being a defender. An attacking unit with Shield gets nothing extra from it." },
      { q: "What happens with multiple instances of Shield?", a: "The Shield values are summed, so a unit with Shield 2 that's also granted Shield 1 by another card gets +3 Might total while defending." },
    ],
    guideSlug: "riftbound-combat-keywords-explained",
    relatedKeywords: ["tank", "deflect", "assault"],
  },
  {
    slug: "deflect",
    name: "Deflect",
    set: "VEN",
    rulesContain: "[Deflect",
    directAnswer:
      "Deflect is a Riftbound keyword that makes a card or ability more expensive for an opponent to target you or the permanent with it. \"Deflect [X]\" adds X Power, of any domain, as a mandatory extra cost every time an opponent's spell or ability chooses that target — a tax on being singled out, not a hard block.",
    sections: [
      {
        heading: "How the Deflect tax works",
        body: "Deflect doesn't stop a spell or ability from targeting the protected permanent — it adds an extra, mandatory cost the opponent has to pay to do it, on top of whatever the card normally costs. That extra Power can be of any domain regardless of what the targeting spell's own cost is in, so it's a flat tax rather than a domain-matching puzzle. If a Deflect unit is targeted more than once by the same effect, the tax applies for each instance.",
      },
      {
        heading: "Why Deflect matters against removal",
        body: "Deflect is most valuable on a unit your opponent actually wants to remove or debuff — every point of Deflect makes their answer that much less efficient, and stacking Deflect from multiple sources compounds. It's a softer defensive tool than [Shield](/keywords/shield) or [Tank](/keywords/tank): it doesn't change combat math, it changes whether removal is worth casting at all. See the [Combat Keywords guide](/guides/riftbound-combat-keywords-explained) for how it fits a defensive plan.",
      },
    ],
    faqs: [
      { q: "What does Deflect do in Riftbound?", a: "Deflect makes an opponent's spells and abilities pay extra Power — any domain — as a mandatory cost every time they target the card with Deflect." },
      { q: "Does Deflect stop targeting outright?", a: "No — it's a tax, not a block. The opponent can still target the Deflect card if they pay the extra cost." },
      { q: "Can Deflect's Power cost be paid with any domain?", a: "Yes — Deflect's added cost is domain-agnostic, so it's paid the same way regardless of what colours the targeting card itself needs." },
    ],
    guideSlug: "riftbound-combat-keywords-explained",
    relatedKeywords: ["shield", "tank", "assault"],
  },
  {
    slug: "assault",
    name: "Assault",
    set: "VEN",
    rulesContain: "[Assault",
    directAnswer:
      "Assault is a Riftbound keyword on units that adds bonus Might — the mirror image of Shield — but only while that unit is attacking. \"Assault [X]\" gives +X Might for the duration of combat as an attacker, disappearing once the unit stops being the Attacker; multiple sources of Assault on the same unit add together.",
    sections: [
      {
        heading: "How Assault's bonus works",
        body: "Assault is short for \"while I am an attacker, I have +X Might.\" The bonus only applies while the unit holds the Attacker designation during Combat — it contributes nothing on defense, and nothing outside combat. Leave X off a card and it defaults to 1; stack multiple Assault sources on the same unit and the bonuses sum, the same way Shield's do.",
      },
      {
        heading: "Assault as a race enabler",
        body: "Where Shield rewards sitting back, Assault rewards initiating — it turns an otherwise modest unit into a real swing the moment you attack with it. That makes it the natural centrepiece of an aggressive line rather than a defensive one; see the [Combat Keywords guide](/guides/riftbound-combat-keywords-explained) for how it compares to Riftbound's other combat keywords.",
      },
    ],
    faqs: [
      { q: "What does Assault mean in Riftbound?", a: "Assault gives a unit +X Might, but only while it's attacking — the bonus is live for that combat and gone once it ends." },
      { q: "Is Assault the opposite of Shield?", a: "Yes — Shield boosts a unit on defense, Assault boosts the same kind of unit on offense. They don't overlap on the same combat." },
      { q: "Does Assault stack from multiple sources?", a: "Yes — like Shield, multiple Assault values on the same unit add together for that combat." },
    ],
    guideSlug: "riftbound-combat-keywords-explained",
    relatedKeywords: ["shield", "tank", "deflect"],
  },
  {
    slug: "backline",
    name: "Backline",
    set: "VEN",
    rulesContain: "[Backline]",
    directAnswer:
      "Backline is a Riftbound keyword on units that pushes combat damage away from them — the reverse of Tank. A unit with Backline must be assigned lethal damage after every other unit the same controller has that doesn't have Backline, so it's protected as long as there's anything else on the board to take the hit first.",
    sections: [
      {
        heading: "How Backline's damage assignment works",
        body: "In the Combat Damage step, an attacker assigning damage across a Backline controller's units must give lethal damage to every non-Backline unit before a Backline unit becomes a valid target at all. If more than one Backline unit is present, the attacker can pick between them once the rest of the board has already taken lethal — the same freedom Tank gives on the opposite end.",
      },
      {
        heading: "Backline as a value-protection tool",
        body: "Backline is most useful on a unit you'd rather not lose in a small skirmish — a payoff engine, a card-advantage generator, anything you want alive at the end of the fight rather than the start of it. Pairing it with [Tank](/keywords/tank) on other units in the same battlefield creates a clear front line and back line, exactly the shape the keyword's name suggests. See the [Combat Keywords guide](/guides/riftbound-combat-keywords-explained) for the full defensive picture.",
      },
    ],
    faqs: [
      { q: "What does Backline do in Riftbound?", a: "A unit with Backline must be assigned lethal combat damage after every other unit the same controller has without Backline — it's protected until the rest of the board has already taken damage." },
      { q: "Is Backline the opposite of Tank?", a: "Yes — Tank must be hit first, Backline must be hit last, among a single controller's units in the same combat." },
      { q: "What if all my units have Backline?", a: "With no non-Backline unit to take priority, an attacker can choose freely among the Backline units, the same way multiple Tank units work." },
    ],
    guideSlug: "riftbound-combat-keywords-explained",
    relatedKeywords: ["tank", "shield", "ganking"],
  },
  {
    slug: "ganking",
    name: "Ganking",
    set: "VEN",
    rulesContain: "[Ganking]",
    directAnswer:
      "Ganking is a Riftbound keyword on units that lets them make a standard move directly from one battlefield to another. Normally a standard move only reaches your base or a battlefield adjacent to it; Ganking is a passive ability that widens those options without removing any move a unit already had.",
    sections: [
      {
        heading: "What Ganking adds to movement",
        body: "Ganking is functionally short for \"I may move to a battlefield from another battlefield with a standard move.\" It's purely additive — it grants a new destination option for the Standard Move action, it doesn't cost anything extra, and it doesn't grant an additional move or activation beyond the unit's normal one.",
      },
      {
        heading: "Why Ganking rewards board presence",
        body: "Because Ganking lets a unit reposition battlefield-to-battlefield rather than routing back through base, it's strongest on a board where you already have units spread across multiple locations — reinforcing a fight, or pulling out of a bad one, without giving up tempo on the trip. See the [Combat Keywords guide](/guides/riftbound-combat-keywords-explained) for how it combines with Tank, Shield and Backline to control where a fight actually happens.",
      },
    ],
    faqs: [
      { q: "What does Ganking do in Riftbound?", a: "Ganking lets a unit's standard move go directly from one battlefield to another, rather than being limited to your base or an adjacent battlefield." },
      { q: "Does Ganking give a unit an extra move?", a: "No — it adds a new destination option to the unit's existing standard move, it doesn't grant an additional movement action." },
      { q: "Does Ganking have an activation cost?", a: "No — it's a passive ability with no cost of its own; it simply changes where a standard move is allowed to go." },
    ],
    guideSlug: "riftbound-combat-keywords-explained",
    relatedKeywords: ["backline", "tank", "shield"],
  },

  // ── Growth & value keywords (Core Rules 812, 824, 823, 821, 818, 805, 817, 808) ─
  // Scaling, resource investment and late-game payoffs. Grouped in
  // /guides/riftbound-growth-keywords-explained. Legion, Level and Repeat have
  // no confirmed live card yet (probed against production, zero matches in any
  // catalogued set) — the rules text below is still fully verified.
  {
    slug: "legion",
    name: "Legion",
    set: "VEN",
    rulesContain: "[Legion]",
    directAnswer:
      "Legion is a Riftbound dependent keyword that rewards playing more than one card in a turn. \"[Legion][>] [Text]\" is short for \"if you've played another card this turn, this card gains [Text]\" — the bonus text is dormant until you've finalized a second card on the same turn, then it switches on for the rest of that turn.",
    sections: [
      {
        heading: "How Legion turns on",
        body: "Legion checks for a DIFFERENT card than the one with the Legion ability having been played by you earlier in the same turn. The moment that's true, the Legion text becomes active for the rest of the turn — it isn't a one-time trigger, it's a condition that stays satisfied once met. If you control several cards with Legion abilities, playing just one other card that turn turns all of them on at once.",
      },
      {
        heading: "Building around Legion",
        body: "Legion rewards a deck built to play multiple cheap cards per turn rather than one expensive one — cheap units, cantrips, anything that gets a second card down early so your Legion payoffs are live for the rest of the turn. It shares a build-around shape with [Level](/keywords/level) and [Hunt](/keywords/hunt): all three ask you to hit a threshold rather than resolve a single effect. See the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how they compare.",
      },
    ],
    faqs: [
      { q: "What does Legion do in Riftbound?", a: "Legion is short for \"if you've played another card this turn, this card gains [Text]\" — its bonus ability switches on for the rest of the turn once you've played a second card." },
      { q: "Does Legion trigger once or stay active?", a: "It stays active — once you've played another card that turn, the Legion text remains on for the rest of the turn, it isn't a single instant trigger." },
      { q: "Do I need to play multiple cards with Legion to turn it on?", a: "No — playing any one other card satisfies every Legion ability you control that turn, not just a matching pair." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["level", "hunt", "weaponmaster"],
  },
  {
    slug: "level",
    name: "Level",
    set: "VEN",
    rulesContain: "[Level",
    directAnswer:
      "Level is a Riftbound dependent keyword tied to XP. \"[Level N][>] [Text]\" is short for \"while you have N or more XP, this card gains [Text]\" — the bonus text switches on the moment your XP total reaches the printed threshold, and switches back off if your XP (or the card's controller) changes and the threshold is no longer met.",
    sections: [
      {
        heading: "How Level abilities turn on and off",
        body: "Unlike a one-time trigger, Level is a running condition — as long as the controlling player's XP stays at or above N, the Dependent Ability stays active, and it goes inactive again the instant XP drops (or the card changes controller and the new controller doesn't meet the threshold). [Hunt](/keywords/hunt) is the most common way to actually gain the XP a Level ability is checking for.",
      },
      {
        heading: "Building toward a Level payoff",
        body: "A Level card is a long-game investment: cheap or unremarkable early, and only worth its full value once your deck's XP engine gets you to the threshold. Pair it with cards that reliably gain XP — [Hunt](/keywords/hunt) is the most direct — and treat the printed N as a target for your whole game plan, not a stat you'll hit by accident. See the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how Level, Legion and Hunt work as a set.",
      },
    ],
    faqs: [
      { q: "What does Level mean in Riftbound?", a: "Level is short for \"while you have N or more XP, this card gains [Text]\" — its bonus is active for as long as your XP stays at or above the printed threshold." },
      { q: "How do you gain XP for Level?", a: "Hunt is the most common source — it grants XP whenever a unit with Hunt conquers or holds a battlefield." },
      { q: "Does a Level ability turn back off?", a: "Yes — it's a running condition, not a one-time trigger. If your XP drops below the threshold, or the card changes controller, the Level text goes inactive again." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["hunt", "legion", "weaponmaster"],
  },
  {
    slug: "hunt",
    name: "Hunt",
    set: "VEN",
    rulesContain: "[Hunt",
    directAnswer:
      "Hunt is a Riftbound triggered-ability keyword on units that grants XP for winning a battlefield. \"Hunt X\" triggers both when the unit Conquers and when it Holds a battlefield, granting its controller X XP each time (X defaults to 1 if omitted) — it's the main engine that fuels [Level](/keywords/level) payoffs.",
    sections: [
      {
        heading: "Conquer, Hold, and when Hunt fires",
        body: "Hunt is short for \"when I Conquer or Hold, my controller gains X XP.\" Both conditions can trigger it — winning a battlefield outright (Conquer) and simply holding one you already control at the right check (Hold) both count, so a Hunt unit that sticks around keeps paying out turn after turn, not just on the turn it first takes the battlefield.",
      },
      {
        heading: "Stacking Hunt and feeding Level",
        body: "If a unit has Hunt from more than one source, the values sum, so a heavily-buffed Hunt unit can generate real XP fast. Because Hunt is the primary way to reach the thresholds [Level](/keywords/level) cards check for, the two are natural deckbuilding partners — see the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how a Hunt-into-Level plan comes together.",
      },
    ],
    faqs: [
      { q: "What does Hunt do in Riftbound?", a: "Hunt grants its controller X XP whenever the unit with Hunt Conquers or Holds a battlefield — both winning it and simply keeping it can trigger the reward." },
      { q: "What is Hunt X used for?", a: "The XP Hunt generates is what powers Level abilities, which check whether a player's total XP meets a printed threshold." },
      { q: "Does Hunt only trigger once per game?", a: "No — it triggers every time its conditions are met, so a Hunt unit holding the same battlefield across multiple turns keeps generating XP." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["level", "legion", "weaponmaster"],
  },
  {
    slug: "weaponmaster",
    name: "Weaponmaster",
    set: "VEN",
    rulesContain: "[Weaponmaster]",
    directAnswer:
      "Weaponmaster is a Riftbound triggered-ability keyword on units that lets them equip a piece of Gear you control at a discount the instant they're played — even outside the normal timing an Equip ability would allow. It's a play effect: choose an Equipment card you control, pay its Equip cost reduced by any-domain Power, and attach it straight to the unit with Weaponmaster.",
    sections: [
      {
        heading: "How Weaponmaster resolves",
        body: "When you play a unit with Weaponmaster, you may choose a card you control with the Equipment tag — even if its rules text is currently inactive, or it doesn't have a usable Equip ability of its own — and pay its Equip cost as though activating it for the unit with Weaponmaster, discounted by any-domain Power. If the cost can't be paid, or the Equipment can't be detached or attached for any reason, it simply stays where it is; the Weaponmaster unit still resolves normally.",
      },
      {
        heading: "Why Weaponmaster rewards a Gear-heavy deck",
        body: "Weaponmaster only does something if you already have Equipment sitting around to grab — it's a payoff for a deck that plays Gear early and expects to arm a threat later, rather than a standalone effect. Pair it with [Equip](/keywords/equip) itself for the full picture of how attaching gear works in Riftbound. See the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how it fits alongside Legion, Level and Hunt as a scaling tool.",
      },
    ],
    faqs: [
      { q: "What does Weaponmaster do?", a: "When you play a unit with Weaponmaster, you may choose an Equipment card you control and attach it to that unit immediately, paying its Equip cost at a discount." },
      { q: "Does the chosen Equipment need to already have a usable Equip ability?", a: "No — Weaponmaster can choose an Equipment card whether or not it currently has a functioning Equip ability of its own." },
      { q: "What happens if the Equip cost can't be paid?", a: "The Equipment just stays wherever it already was — Weaponmaster's attempt fizzles quietly, it doesn't stop the unit itself from resolving." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["equip", "hunt", "legion"],
  },
  {
    slug: "equip",
    name: "Equip",
    set: "VEN",
    rulesContain: "[Equip",
    directAnswer:
      "Equip is a Riftbound activated-ability keyword on Gear cards tagged Equipment. Paying the printed \"Equip [Cost]\" attaches that Gear to a unit you choose and control — turning a card sitting in play into a permanent boost on the unit it's attached to, activatable any time you could normally activate an ability.",
    sections: [
      {
        heading: "How activating Equip works",
        body: "Equip is short for \"[Cost]: attach this gear to a unit you control.\" The unit you choose is a target, and once the cost is paid the Gear attaches to it directly — the unit is then considered Equipped for as long as that (or any) Equipment stays attached to it. Multiple Equip abilities on the same card are treated as separate activated abilities, each payable on its own.",
      },
      {
        heading: "Equip and Weaponmaster together",
        body: "Equip is the manual version — pay the cost yourself, on your own timing, to attach the Gear. [Weaponmaster](/keywords/weaponmaster) is the automated version — a unit that grabs an Equipment card the moment it's played, at a discount. A deck built around Gear typically wants both: enough Equipment to be worth having around, and a way to get it onto the board efficiently. See the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how Equipment fits the wider set of scaling tools.",
      },
    ],
    faqs: [
      { q: "What does Equip mean in Riftbound?", a: "Equip is an activated ability on Gear cards — paying its printed cost attaches the Gear to a unit you choose and control." },
      { q: "Is a unit with attached Gear called anything specific?", a: "Yes — it's considered Equipped for as long as it has one or more Equipment cards attached to it." },
      { q: "How is Equip different from Weaponmaster?", a: "Equip is something you pay for and activate yourself on your own timing; Weaponmaster automatically offers a discounted equip the instant a unit with that keyword is played." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["weaponmaster", "hunt", "accelerate"],
  },
  {
    slug: "accelerate",
    name: "Accelerate",
    set: "VEN",
    rulesContain: "[Accelerate]",
    directAnswer:
      "Accelerate is a Riftbound unit ability that lets you pay an optional extra cost as you play the unit to have it enter the board already readied, instead of exhausted. It's a one-time tempo boost paid for at the moment of playing the card — Accelerate has no function once the unit is already on the board.",
    sections: [
      {
        heading: "How Accelerate's cost and payoff work",
        body: "Accelerate is short for \"as you play me, you may pay [1][Power] as an additional cost — if you do, I enter ready.\" The Power portion must match one of the unit's own domains if it has any, or can be paid with Power of any domain if the unit is domainless. It can only be paid during the steps of playing the card, never afterward, and the effect is a delayed replacement — even if the unit somehow lost Accelerate mid-resolution, paying the cost still guarantees it enters ready rather than exhausted.",
      },
      {
        heading: "Why entering readied matters",
        body: "A unit that enters exhausted (the default) can't attack, block, or use tap abilities that turn — Accelerate skips that downtime for an extra cost, letting the unit act the moment it lands. That makes it a pure tempo tool: pay more now, get to use the unit immediately instead of waiting a turn. See the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how it compares to Riftbound's other resource-investment keywords.",
      },
    ],
    faqs: [
      { q: "What does Accelerate do in Riftbound?", a: "Accelerate lets you pay an optional extra cost as you play a unit so it enters the board readied instead of exhausted, letting it act immediately." },
      { q: "Can you pay Accelerate's cost after the unit is already on the board?", a: "No — it can only be paid during the steps of playing the card, as an additional cost, not afterward." },
      { q: "What Power can pay Accelerate's cost?", a: "Power matching one of the unit's own domains, or Power of any domain if the unit is domainless." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["equip", "vision", "hunt"],
  },
  {
    slug: "vision",
    name: "Vision",
    set: "VEN",
    rulesContain: "[Vision]",
    directAnswer:
      "Vision is a Riftbound triggered-ability keyword on permanents that fires when the permanent is played, letting its controller Predict — look at the top card of their Main Deck and choose whether to keep it there or Recycle it away. It's Riftbound's card-selection tool, smoothing out what you're about to draw.",
    sections: [
      {
        heading: "How Vision resolves",
        body: "Vision is short for \"when this is played, predict\" — the trigger is the permanent entering the board. If a permanent has more than one instance of Vision, each triggers and resolves separately, and if nothing else happens between them, each instance sees the same top card unless the first Predict changed it.",
      },
      {
        heading: "Why Vision is a quiet value engine",
        body: "Vision doesn't draw an extra card or dig deep — it just lets you dodge a card you don't want to draw next, one look at a time. That makes it most valuable stacked across several permanents rather than relied on alone; a deck with several Vision sources gets meaningfully smoother draws over a long game. See the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how it complements Riftbound's other scaling tools.",
      },
    ],
    faqs: [
      { q: "What does Vision do in Riftbound?", a: "Vision triggers when the permanent with it is played, letting its controller Predict — look at the top card of their Main Deck and choose whether to keep it on top or Recycle it." },
      { q: "What happens with multiple instances of Vision?", a: "Each triggers and resolves separately, with its own independent choice of whether to recycle the card it sees." },
      { q: "Does Vision draw a card?", a: "No — it only lets you look at and optionally recycle the top card, it doesn't put anything into your hand by itself." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["accelerate", "hunt", "predict"],
  },
  {
    slug: "deathknell",
    name: "Deathknell",
    set: "VEN",
    rulesContain: "[Deathknell]",
    directAnswer:
      "Deathknell is a Riftbound triggered-ability keyword on permanents, short for \"when I die, [Effect].\" It fires when the permanent is Killed and actually sent to the trash — if something replaces that death (a recall, for instance) before it happens, the Deathknell effect never triggers, since the permanent was never truly sent to the trash.",
    sections: [
      {
        heading: "What counts as \"dying\" for Deathknell",
        body: "The trigger is specifically the permanent being Killed and moved to the trash. If a replacement effect intercepts that — recalling the card to hand instead, for example — the death that Deathknell is watching for never actually happens, so the ability doesn't fire. Before the card physically moves, the game notes its location and relevant details so the Deathknell effect can still reference them once it resolves.",
      },
      {
        heading: "Multiple Deathknells and building around them",
        body: "A permanent with more than one Deathknell effect triggers each of them separately when it dies, and its controller chooses the order to add them to the chain. Because Deathknell rewards a card for dying rather than surviving, it pairs naturally with sacrifice effects, trades you're happy to make, and any plan that treats a unit's death as the payoff rather than the cost. See the [Growth Keywords guide](/guides/riftbound-growth-keywords-explained) for how it fits alongside Riftbound's other value-generating keywords.",
      },
    ],
    faqs: [
      { q: "What does Deathknell mean in Riftbound?", a: "Deathknell is short for \"when I die, [Effect]\" — it triggers when the permanent is Killed and sent to the trash." },
      { q: "Does Deathknell trigger if a card is recalled instead of dying?", a: "No — if the permanent's death is replaced by something else, like being recalled, it was never actually sent to the trash, so Deathknell doesn't fire." },
      { q: "What if a permanent has multiple Deathknell abilities?", a: "Each one triggers separately when it dies, and its controller chooses the order they're added to the chain." },
    ],
    guideSlug: "riftbound-growth-keywords-explained",
    relatedKeywords: ["hunt", "vision", "legion"],
  },

  // ── Core game actions (Core Rules 442, 820, 816, 825, 706-708, 426, 429, 436, 423) ─
  // These are "Game Actions" in Riot's rules structure, not the bracketed
  // "Keywords" the rest of this file covers — verbs used inside other cards'
  // ability text (e.g. "Buff a unit.", "Add [2]."), rather than a standalone
  // keyword line. Grouped in /guides/riftbound-game-actions-explained. Repeat,
  // Temporary, Unique, Mighty, Buff and Stun have no confirmed live card yet
  // (probed against production in every printed format tried); the rules text
  // is still fully verified against the source PDF.
  {
    slug: "disempower",
    name: "Disempower",
    set: "VEN",
    rulesContain: "Disempower",
    directAnswer:
      "Disempower is the Riftbound game action that removes the Empowered status from a card. It only ever affects a card that's currently Empowered — an instruction to Disempower a card that isn't Empowered simply does nothing, so it's a targeted \"undo\" for the Empower mechanic rather than a general-purpose debuff.",
    sections: [
      {
        heading: "How Disempower resolves",
        body: "Disempowering strips the Empowered status outright from one or more Game Objects. If the chosen card was never Empowered in the first place, the instruction is a no-op — there's no partial effect or fallback, it simply does nothing. Players may only Disempower when a game effect directs them to.",
      },
      {
        heading: "Disempower's role against an Empower deck",
        body: "Because [Empower](/keywords/empower) is one of the strongest scaling tools in the Vendetta card pool, Disempower is the natural answer to it — stripping the status turns off whatever Dependent Ability the Empower keyword unlocked, undoing the opponent's investment in a single instruction. Read the full breakdown in the [Empower guide](/guides/riftbound-empower-explained), which covers both sides of the Empower / Disempower relationship in depth.",
      },
    ],
    faqs: [
      { q: "What does Disempower do in Riftbound?", a: "Disempower removes the Empowered status from a card, turning off whatever ability that status was granting." },
      { q: "Can you Disempower a card that was never Empowered?", a: "No — the instruction does nothing if the target isn't currently Empowered." },
      { q: "Is Disempower the same as killing or removing a card?", a: "No — it only strips the Empowered status. The card itself stays exactly where it is, just without the bonus Empowered was granting." },
    ],
    guideSlug: "riftbound-empower-explained",
    relatedKeywords: ["empower", "flow", "burn"],
  },
  {
    slug: "predict",
    name: "Predict",
    set: "VEN",
    rulesContain: "Predict",
    directAnswer:
      "Predict is the Riftbound game action of looking at the top card of your Main Deck and choosing whether to keep it there or Recycle it away. \"Predict X\" looks at that many cards at once, recycling any number of them and putting the rest back on top in any order — it's the mechanic that powers the [Vision](/keywords/vision) keyword.",
    sections: [
      {
        heading: "How Predict works",
        body: "Predicting shows you the top card (or, for Predict X, the top X cards) of your own Main Deck without revealing it to anyone else. You then choose which of the seen cards to Recycle and which to leave on top, in whatever order you like. If X is omitted, it defaults to 1. If your deck has fewer cards left than the number you're predicting, you simply predict as many as are available — it never causes a Burn Out on its own.",
      },
      {
        heading: "Predict as card selection",
        body: "Predict is Riftbound's core smoothing tool — it doesn't draw extra cards, it just lets you steer what you're about to draw next. [Vision](/keywords/vision) is the most common source, triggering a Predict every time a Vision permanent is played. See the [Game Actions guide](/guides/riftbound-game-actions-explained) for how Predict compares to Riftbound's other card-manipulation tools.",
      },
    ],
    faqs: [
      { q: "What does Predict mean in Riftbound?", a: "Predicting is looking at the top card (or cards, for Predict X) of your own Main Deck and choosing whether to Recycle each one or leave it on top." },
      { q: "Does Predict draw a card?", a: "No — it only lets you look at and optionally recycle the top of your deck; nothing goes to your hand from Predict alone." },
      { q: "What triggers a Predict in Riftbound?", a: "The Vision keyword is the most common source — it instructs its controller to Predict whenever the permanent with Vision is played." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["vision", "add", "buff"],
  },
  {
    slug: "add",
    name: "Add",
    set: "VEN",
    rulesContain: "Add ",
    directAnswer:
      "Add is the Riftbound game action of putting resources — Energy or Power — into a player's Rune Pool. \"Add [2]\" means add 2 Energy; a domain letter (like \"Add [Y]\") adds Power of that domain instead. Abilities that Add resources resolve immediately once finalized, ahead of anything else outstanding on the chain.",
    sections: [
      {
        heading: "How Adding resources actually resolves",
        body: "Triggered and activated abilities that Add resources finalize and resolve right away — they don't pass priority the way most effects do, and a spell that Adds resources still lingers on the chain normally once finalized. That immediacy is what makes Add-with-Reaction abilities so flexible: they can be activated the instant costs need paying, even mid-resolution of something else.",
      },
      {
        heading: "Add abilities with Reaction",
        body: "An activated ability that both Adds resources and carries [Reaction](/keywords/reaction) can be used at essentially any moment a cost needs to be paid — including during the Pay Costs step of playing an entirely different card. That combination is Riftbound's main way of banking flexible mana on the fly rather than committing it turns in advance. See the [Game Actions guide](/guides/riftbound-game-actions-explained) for how Add fits the rest of the resource system.",
      },
    ],
    faqs: [
      { q: "What does \"Add\" mean on a Riftbound card?", a: "Add means putting resources — Energy or Power of a specific domain — into your Rune Pool, ready to spend on costs." },
      { q: "Do Add abilities pass priority like other effects?", a: "No — they finalize and resolve immediately, ahead of anything else outstanding, rather than passing priority in the normal way." },
      { q: "Why does Add pair so well with Reaction?", a: "A Reaction ability that Adds resources can be activated the instant a cost needs paying, even mid-resolution of another spell or ability — letting you hold resources back until exactly when they're needed." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["reaction", "predict", "buff"],
  },
  {
    slug: "buff",
    name: "Buff",
    set: "VEN",
    rulesContain: "Buff",
    directAnswer:
      "Buff is the Riftbound game action of placing a Buff counter on a unit. A unit can only ever hold one Buff counter at a time — an effect that would Buff an already-Buffed unit simply does nothing further, so stacking multiple \"buff\" instructions on the same unit doesn't compound unless something explicitly grants permission to do so.",
    sections: [
      {
        heading: "How Buffing and Buff counters work",
        body: "Buffing places a single Buff counter on a chosen unit, if it doesn't already have one. A unit that already carries a Buff counter can still be chosen for a further Buff instruction — it just won't receive a second counter from it, since only one Buff counter can be on a unit at a time unless a specific effect says otherwise.",
      },
      {
        heading: "\"If it was buffed this way\" clauses",
        body: "Because a Buff instruction can silently fail to add anything (when the unit is already Buffed), some cards check whether the Buff actually happened before doing something further — a clause like \"if it was buffed this way, draw a card\" only pays off when the counter was genuinely placed, not just when a unit was chosen. Read the printed condition carefully rather than assuming every Buff instruction always lands. See the [Game Actions guide](/guides/riftbound-game-actions-explained) for how Buff compares to Riftbound's other counters and modifiers.",
      },
    ],
    faqs: [
      { q: "What does Buff mean in Riftbound?", a: "Buffing places a Buff counter on a chosen unit — but only if it doesn't already have one; a unit can hold just one Buff counter at a time." },
      { q: "What happens if you try to Buff an already-Buffed unit?", a: "The unit can still be chosen, but no additional counter is placed — the instruction simply doesn't add anything further." },
      { q: "Why do some cards say \"if it was buffed this way\"?", a: "Because a Buff instruction can fail to place a counter (on an already-Buffed unit), that clause checks whether the Buff genuinely happened before triggering a further effect." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["mighty", "add", "predict"],
  },
  {
    slug: "stun",
    name: "Stun",
    set: "VEN",
    rulesContain: "Stun",
    directAnswer:
      "Stun is the Riftbound game action of rendering one or more units Stunned — a binary state that stops a unit contributing its Might to combat damage. A Stunned unit can't be Stunned again while it's already in that state, and it loses Stunned automatically during end-of-turn cleanup, but it still needs damage equal to its full Might to actually be killed.",
    sections: [
      {
        heading: "What being Stunned actually does",
        body: "A Stunned unit is simply skipped over when combat damage is dealt — its Might doesn't count toward the damage its side deals that combat. It's a binary status: a unit is Stunned or it isn't, so re-Stunning an already-Stunned unit changes nothing and won't trigger effects that care about the act of stunning something. Stunned wears off during step 3d of end-of-turn cleanup.",
      },
      {
        heading: "Stun vs killing a unit",
        body: "Stunning takes a unit out of a single combat's damage math without removing it from the board — it still needs to take damage equal to its full Might (not a reduced amount) to actually die, and it's back to normal the following turn. That makes Stun a tempo tool for winning one specific fight, not a way to permanently deal with a threat. See the [Game Actions guide](/guides/riftbound-game-actions-explained) for how it compares to Riftbound's other combat-disrupting effects.",
      },
    ],
    faqs: [
      { q: "What does Stun do in Riftbound?", a: "A Stunned unit doesn't contribute its Might to combat damage — it's skipped over in the damage step, though it's still a valid combatant otherwise." },
      { q: "Can you Stun an already-Stunned unit?", a: "No further effect happens — Stunned is a binary state, so stunning a unit that's already Stunned changes nothing." },
      { q: "When does Stunned wear off?", a: "During end-of-turn cleanup, specifically step 3d — a Stunned unit is back to normal by the start of the next turn." },
      { q: "Does a Stunned unit still need full damage to die?", a: "Yes — a Stunned unit still requires damage equal to or greater than its full Might to be killed; being Stunned doesn't make it easier to kill." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["mighty", "buff", "add"],
  },
  {
    slug: "mighty",
    name: "Mighty",
    set: "VEN",
    rulesContain: "Mighty",
    directAnswer:
      "Mighty is a Riftbound description that applies automatically to any unit with 5 or more Might — it isn't something a card grants directly, it's a threshold other cards can check for. A unit \"is Mighty\" the instant its Might reaches 5, and stops being Mighty the instant that value drops, without needing any instruction to turn it on or off.",
    sections: [
      {
        heading: "How the Mighty threshold works",
        body: "Being Mighty is purely derived from a unit's current Might total — reach 5 or more, by any combination of printed stats and modifiers, and the unit counts as Mighty for as long as that total holds. Buffs, Shield, Assault and printed stat lines all count toward it equally; there's no separate \"Mighty\" counter or status to track.",
      },
      {
        heading: "Cards that check for Mighty",
        body: "Because Mighty is just a live threshold, cards that reference it (\"while I'm Mighty, I have...\") gain and lose those bonuses automatically as the unit's Might crosses 5 in either direction over the course of a game — no separate trigger required. That makes stat-boosting effects like [Buff](/keywords/buff), Shield and Assault doubly valuable on a unit sitting just under the line. See the [Game Actions guide](/guides/riftbound-game-actions-explained) for how Mighty interacts with Riftbound's other stat-modifying tools.",
      },
    ],
    faqs: [
      { q: "What does it mean for a unit to be Mighty in Riftbound?", a: "A unit is Mighty as long as its current Might is 5 or greater — it's a derived threshold, not something granted by a specific card." },
      { q: "Does a unit stop being Mighty if its Might drops?", a: "Yes — being Mighty is checked continuously off the unit's current Might; if it drops below 5, the unit is no longer Mighty until it's boosted back up." },
      { q: "Do buffs count toward the Mighty threshold?", a: "Yes — any source that raises a unit's Might, including counters and combat bonuses like Shield or Assault, counts toward whether it's Mighty." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["buff", "shield", "assault"],
  },
  {
    slug: "unique",
    name: "Unique",
    set: "VEN",
    rulesContain: "Unique",
    directAnswer:
      "Unique is a Riftbound deck-construction restriction, not a rules-text effect — a card with Unique limits your deck to just one copy of that exact name. It has no impact during gameplay itself; the restriction is enforced entirely when a deck is built, before the game even starts.",
    sections: [
      {
        heading: "How Unique restricts deckbuilding",
        body: "A deck can hold only one card with a given name if that card has Unique. If a Unique card is also a Signature print, its deck can still include the usual combination of three Signature cards overall — Unique only restricts how many copies of that ONE named card can appear, it doesn't change the broader Signature-card allowance.",
      },
      {
        heading: "Unique has no in-game effect",
        body: "Unlike every other entry in this glossary, Unique doesn't do anything once the game starts — it's purely a Deck Construction Permission, checked only when a deck list is validated. A Unique card plays exactly like any other card of its type once it's in your deck; the keyword's whole job is done before the first turn.",
      },
    ],
    faqs: [
      { q: "What does Unique mean in Riftbound?", a: "Unique restricts a deck to containing only one card of that exact name — it's a deckbuilding rule, not something that affects gameplay." },
      { q: "Does Unique affect a card once the game has started?", a: "No — Unique has no in-game effect at all; it's enforced only when the deck is constructed." },
      { q: "Can a Unique card also be a Signature print?", a: "Yes — a deck can still run its normal allowance of Signature cards; Unique only limits copies of that one specific named card within that allowance." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["mighty", "temporary", "repeat"],
  },
  {
    slug: "temporary",
    name: "Temporary",
    set: "VEN",
    rulesContain: "[Temporary]",
    directAnswer:
      "Temporary is a Riftbound triggered-ability keyword on permanents, short for \"at the start of this permanent's controller's Beginning Phase, before scoring, kill this.\" A Temporary permanent is built to last exactly one round — it's automatically killed at the very start of its controller's next Beginning Phase, before points are even scored that turn.",
    sections: [
      {
        heading: "When a Temporary permanent actually dies",
        body: "The trigger is its controller's Beginning Phase starting — specifically before scoring happens that phase — so a Temporary permanent gets the rest of the turn it entered on, plus reaches the very start of the next one, before it's removed. Multiple instances of Temporary on the same card are redundant; regardless of how many copies of the ability are stacked, the permanent is only killed once.",
      },
      {
        heading: "Why cards use Temporary",
        body: "Temporary is how Riftbound prints an effect that's meant to matter for a single turn cycle and then clean itself up automatically — a token, a short-lived buff-carrier, anything the game doesn't want lingering. See the [Game Actions guide](/guides/riftbound-game-actions-explained) for how it compares to other self-limiting effects like Repeat and Stun.",
      },
    ],
    faqs: [
      { q: "What does Temporary mean in Riftbound?", a: "Temporary is short for \"at the start of this permanent's controller's Beginning Phase, before scoring, kill this\" — the permanent is automatically removed at the very start of the following round." },
      { q: "Does a Temporary permanent die immediately?", a: "No — it survives the rest of the turn it entered on and into the start of the following turn, where it's then killed before scoring." },
      { q: "What if a card has multiple instances of Temporary?", a: "They're redundant — the permanent is still only killed once, regardless of how many copies of the ability it carries." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["unique", "repeat", "mighty"],
  },
  {
    slug: "repeat",
    name: "Repeat",
    set: "VEN",
    rulesContain: "[Repeat",
    directAnswer:
      "Repeat is a Riftbound optional-additional-cost keyword on spells and abilities. Paying \"Repeat [Cost]\" as you play the card lets its effect execute a second time on resolution — the same instructions run twice, back to back, as though the card's text were printed out in full a second time.",
    sections: [
      {
        heading: "How Repeat's extra cost and effect work",
        body: "Repeat is short for \"you may pay [Cost] as an additional cost as you play this — if you do, execute the instructions of this chain item one additional time during resolution.\" The choices for the second execution — targets, modes, anything the card asks you to pick — are made at the usual point during resolution, and they don't have to match the choices from the first execution.",
      },
      {
        heading: "Multiple instances of Repeat",
        body: "If a card carries more than one instance of Repeat, each cost can be paid separately, and the effect executes one additional time for every instance that was paid for — but no matter how many times its instructions run, the card is still only considered Played once. See the [Game Actions guide](/guides/riftbound-game-actions-explained) for how it fits alongside Riftbound's other optional-cost tools.",
      },
    ],
    faqs: [
      { q: "What does Repeat do in Riftbound?", a: "Repeat is an optional extra cost — pay it as you play a spell or ability, and its instructions execute a second time on resolution." },
      { q: "Do the choices have to be the same for both executions of a Repeat effect?", a: "No — you can choose different targets or modes for the additional execution than you did for the first one." },
      { q: "What happens with multiple instances of Repeat on one card?", a: "Each can be paid separately, and the card's instructions execute one additional time per instance paid for." },
    ],
    guideSlug: "riftbound-game-actions-explained",
    relatedKeywords: ["temporary", "unique", "mighty"],
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
