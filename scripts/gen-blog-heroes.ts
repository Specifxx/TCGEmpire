#!/usr/bin/env tsx
/**
 * Generates the featured images for the blog's editorial articles.
 *
 * WHY GENERATE RATHER THAN SOURCE: an article about TCGplayer's fee structure or
 * cross-border FX has no honest photograph. Stock imagery would be decorative
 * noise that costs 150 KB and says nothing, and lifting a marketplace's own
 * screenshots is someone else's IP. A generated card in the site's own palette
 * is on-brand, weighs ~20 KB, and its alt text can describe something true.
 *
 * Output is 1200x630 (the OG ratio, so the same file works as the share card)
 * written to public/blog/<slug>.png. scripts/optimize-images.ts then compresses
 * it and emits the .webp/.avif renditions, and public/image-manifest.json picks
 * up its intrinsic dimensions — so <Picture> gets explicit width/height for free.
 *
 * Idempotent: skips any hero that already exists. Pass --force to redraw.
 *
 * Run: npm run blog:heroes
 */
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "public", "blog");

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND = "#34d17e";
const ACCENT = "#38bdf8";

// The actual RiftCompare "R" mark (components/BrandLogo.tsx's mask source),
// embedded as a data URI so every generated hero carries the real logo next
// to the wordmark — not just the wordmark on its own.
const LOGO_PATH = path.join(process.cwd(), "public", "logo-r-green.png");
const LOGO_DATA_URI = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;

/**
 * The graphic in the hero's right-hand third.
 *
 * It used to be one hardcoded thing — three bars with the cheapest highlighted —
 * drawn on every hero regardless of subject. That reads as a price comparison,
 * which is honest on a pricing post and pure decoration on a release-date
 * announcement or a rules guide. A thumbnail that says something false about the
 * article is worse than one that says nothing.
 *
 * So the motif is per-post now. `bars` stays the default, so every existing hero
 * renders byte-identically and does not need redrawing.
 */
type Motif =
  /** Price comparison: three quotes for the same card, cheapest highlighted. */
  | { kind: "bars" }
  /** A single date the post is really about — a release, a deadline, a drawing. */
  | { kind: "date"; label: string; big: string; sub: string }
  /** A short status list. Every row is a tick; used where "all of these" is the answer. */
  | { kind: "checklist"; label: string; items: string[] }
  /**
   * A grid of short, distinctly-coloured tiles — for a post whose whole subject
   * IS a set of named categories (archetypes, domains, tiers). Every other motif
   * here is monochrome (brand green on near-black); this is the one place colour
   * itself carries information, which is what makes it read as "a real taxonomy"
   * rather than decoration and is why it was worth a fourth motif instead of
   * reusing checklist. Up to 9 items, 3 per row.
   */
  | { kind: "grid"; label: string; items: { text: string; color: string }[] }
  /**
   * A short ranked list where the DIRECTION of each row is the point — a legend
   * rising, falling or newly arriving. For a post about the metagame actually
   * moving (a tournament result, a set landing), where "which way is this
   * going" is the claim a checklist's flat ticks can't make.
   */
  | { kind: "movers"; label: string; items: { text: string; dir: "up" | "down" | "new" }[] };

interface Hero {
  slug: string;
  kicker: string;
  title: string;
  /** Up to three short stat/label chips drawn along the bottom. */
  chips: string[];
  /** Right-hand graphic. Omit for the price-comparison bars. */
  motif?: Motif;
}

/**
 * One entry per article that wants a generated hero. Keep the `slug` identical
 * to the article's slug in src/lib/articles.ts — that is the only link between
 * the two, and Article.hero.src is `/blog/<slug>.png`.
 */
const HEROES: Hero[] = [
  {
    slug: "riftbound-card-values",
    kicker: "Explainer · Prices",
    title: "Riftbound Card Values",
    chips: ["Live US prices", "Sold comps", "Top movers"],
  },
  {
    slug: "ebay-bidding-strategies",
    kicker: "How-to · Buying",
    title: "eBay Bidding Strategies",
    chips: ["Proxy bidding", "Sniping 3–5s", "Landed cost"],
  },
  {
    slug: "tcgplayer-fees",
    kicker: "Explainer · Selling",
    title: "TCGplayer Fees, Explained",
    chips: ["Commission", "Processing", "Your real net"],
  },
  {
    slug: "currency-conversion-fees",
    kicker: "Explainer · Buying abroad",
    title: "Currency Conversion Fees",
    chips: ["FX markup", "Decline DCC", "True landed cost"],
  },
  {
    slug: "most-expensive-riftbound-cards",
    kicker: "Listicle · Collecting",
    title: "The Most Expensive Riftbound Cards",
    chips: ["Signature", "Metal", "PSA 10 premiums"],
  },
  {
    slug: "best-riftbound-marketplaces",
    kicker: "Comparison · Marketplaces",
    title: "The Best Riftbound TCG Marketplaces",
    chips: ["10 compared", "Fees + shipping", "Total cost"],
  },
  {
    slug: "riftbound-card-price-comparison",
    kicker: "Explainer · Price comparison",
    title: "Riftbound Card Price Comparison",
    chips: ["6 markets", "Shipping included", "No hidden fees"],
  },
  {
    slug: "riftcompare-review",
    kicker: "Review · Marketplace tools",
    title: "RiftCompare Reviewed",
    chips: ["What it does", "What it doesn't", "Who it's for"],
  },
  {
    slug: "how-to-choose-a-riftbound-marketplace",
    kicker: "How-to · Buying",
    title: "How to Choose a Riftbound Marketplace",
    chips: ["7 criteria", "Scorecard", "Red flags"],
  },
  {
    slug: "riftbound-variant-glossary",
    kicker: "Glossary · Collecting",
    title: "Riftbound Variant & Finish Glossary",
    chips: ["Standard → Signature", "Overnumbered", "Alternate art"],
  },
  {
    slug: "riftbound-2027-set-roadmap",
    kicker: "News · Roadmap",
    title: "Riftbound's 2027 Set Roadmap",
    chips: ["Radiance · Oct 2026", "Legacy · Jan 2027", "The Reckoning · Apr 2027"],
  },
  {
    slug: "riftbound-legacy-pack-changes-and-card-templating",
    kicker: "News · Rules",
    title: "Legacy: Pack & Templating Changes",
    chips: ["6 commons, not 7", "Legend/Battlefield slot", "Built for draft"],
  },
  {
    slug: "riftbound-august-2026-state-of-the-game-takeaways",
    kicker: "News · Analysis",
    title: "August 2026 State of the Game",
    chips: ["Ban philosophy", "2v2 by 2028", "Collectors vs players"],
  },
  {
    slug: "best-riftbound-price-comparison-sites",
    kicker: "Comparison · Price tools",
    title: "Best Riftbound Price Comparison Sites",
    chips: ["10 sites ranked", "5 criteria scored", "RiftCompare #1"],
  },
  {
    slug: "riftcompare-launches-in-the-eu",
    kicker: "News · EU launch",
    title: "RiftCompare Is Now Live in the EU",
    chips: ["11 real EU stores", "Priced in EUR", "6th market"],
  },
  {
    slug: "buy-riftbound-cards-europe",
    kicker: "Buying guide · Europe",
    title: "Riftbound Card Prices: Europe",
    chips: ["11 EU stores", "Priced in EUR", "6 countries"],
  },
  {
    slug: "where-to-buy-riftbound-cards",
    kicker: "Guide · Where to buy",
    title: "Where to Buy Riftbound Cards",
    chips: ["6 markets", "100+ stores", "Singles & sealed"],
  },
  {
    slug: "riftbound-radiance-what-we-know",
    kicker: "News · Set 5",
    title: "Radiance: What's Confirmed",
    // The release date IS the story — it is the one fact the whole post is
    // built on, so it gets the graphic rather than a generic price motif.
    chips: ["~180 cards", "5 new Legends", "Card list unrevealed"],
    motif: { kind: "date", label: "Releases", big: "23 OCT", sub: "2026" },
  },
  {
    slug: "riftbound-format-legality-rotation",
    kicker: "Guide · Rules",
    title: "Does Riftbound Rotate?",
    // Four ticks IS the answer: nothing has rotated out. A reader gets the
    // conclusion from the thumbnail before opening the post.
    chips: ["Bans, not rotation", "No policy announced", "Standard + 2v2 differ"],
    motif: {
      kind: "checklist",
      label: "Still legal",
      // All five released sets, matching the article's table exactly. Showing
      // four when the post says "all five released sets are legal" just prompts
      // "so which one isn't?".
      items: ["Origins", "Proving Grounds", "Spirit Forged", "Unleashed", "Vendetta"],
    },
  },
  {
    slug: "riftbound-deck-archetypes-guide",
    kicker: "Guide · Deckbuilding",
    title: "Riftbound Deck Archetypes",
    // "9 real archetypes" IS the thumbnail's claim, so the grid below has to
    // show exactly 9 — see the article's own self-checking test for why that
    // number is read from the data rather than typed twice.
    chips: ["9 real archetypes", "From live tournament decks", "Which to build first"],
    motif: {
      kind: "grid",
      label: "Archetypes",
      // Colours cycle through Riftbound's own domain palette (lib/constants.ts
      // DOMAINS) — not a claim that a given archetype belongs to that domain
      // (most span two), just real, on-brand colour rather than nine shades of
      // grey. Order matches the article's own comparison table.
      items: [
        { text: "Aggro", color: "#e5484d" },
        { text: "Tempo", color: "#30a46c" },
        { text: "Midrange", color: "#3b82f6" },
        { text: "Combo", color: "#f5a524" },
        { text: "Disruption", color: "#a855f7" },
        { text: "Value", color: "#cbd5e1" },
        { text: "Gear", color: "#e5484d" },
        { text: "Spell", color: "#30a46c" },
        { text: "Reach", color: "#3b82f6" },
      ],
    },
  },
  {
    slug: "best-basket-cheapest-riftbound-deck",
    kicker: "Guide · Deckbuilding",
    title: "Best Basket: Cheapest Way to Buy a Deck",
    chips: ["Free with account", "Shipping included", "vs. naive total"],
  },
  // The three crossover-onboarding guides below reference another game's NAME
  // in plain text only — no logos, mascots, card frames or artwork from any of
  // them. That is the same nominative-fair-use reference the article's own
  // <title>/<h1> already makes (see articles.ts's own note on these three: "no
  // invented crossover promos/collabs — there are none"), just rendered instead
  // of typeset. Keeps every hero on this file's one drawing routine and its one
  // real IP — RiftCompare's own brand mark and palette — rather than sourcing a
  // photo of someone else's cards, which stock-photo licensing does NOT clear:
  // a license to use the PHOTOGRAPH is not a license to depict a third party's
  // copyrighted card art or trademarked logo/mascot inside it.
  {
    slug: "pokemon-collector-to-riftbound",
    kicker: "Guide · From Pokémon",
    title: "From Pokémon to Riftbound",
    chips: ["Same LGS + online buying", "Start with a preconstructed deck", "No official crossover"],
    motif: {
      kind: "checklist",
      label: "Carries over",
      items: ["Physical cards", "LGS + online stores", "Preconstructed decks", "Chase alt-arts"],
    },
  },
  {
    slug: "one-piece-tcg-to-riftbound",
    kicker: "Guide · From One Piece TCG",
    title: "From One Piece TCG to Riftbound",
    chips: ["Both genuinely recent games", "Same singles marketplaces", "No official crossover"],
    motif: {
      kind: "checklist",
      label: "Carries over",
      items: ["Physical cards", "Early-set scarcity", "Singles marketplaces", "Chase prints"],
    },
  },
  {
    slug: "mtg-to-riftbound",
    kicker: "Guide · From Magic: The Gathering",
    title: "From MTG to Riftbound",
    chips: ["Domains work like colors", "Same LGS + singles market", "No official crossover"],
    motif: {
      kind: "checklist",
      label: "Carries over",
      items: ["Domains ≈ colors", "Runes ≈ manabase", "Constructed formats", "Singles market"],
    },
  },
  {
    slug: "riftbound-meta-shift-radiance-singapore",
    kicker: "Meta report · Tournaments",
    title: "How the Meta Shifts Next",
    chips: ["Barcelona's Kennen upset", "Singapore RQ, live", "Radiance in 7 weeks"],
    motif: {
      kind: "movers",
      label: "Reading the shift",
      // Not a claim about where any of these NET out by October — see the
      // article's own refusal to predict individual card prices. Each row is a
      // real, sourced direction: Kennen was still the most-played legend in the
      // room at Barcelona AND lost the final to Ornn, so its grip on the format
      // as the presumptive best deck is the thing that slipped, not its play
      // rate; Ornn is the deck that just proved it; Radiance is a genuinely new
      // entrant to whatever the metagame becomes after it.
      items: [
        { text: "Kennen's grip on the meta", dir: "down" },
        { text: "Ornn, after Barcelona", dir: "up" },
        { text: "Radiance, Oct 23", dir: "new" },
      ],
    },
  },
];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Greedy wrap on an approximate advance width. DejaVu Sans Bold averages ~0.60em
 * per character at these sizes; the estimate only has to be good enough to avoid
 * overflowing a 1,040px text column, and undershooting just wraps a line early.
 */
function wrap(text: string, fontSize: number, maxWidth: number): string[] {
  const perChar = fontSize * 0.6;
  const maxChars = Math.max(8, Math.floor(maxWidth / perChar));
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function svgFor(h: Hero): string {
  const titleSize = h.title.length > 34 ? 62 : 76;
  const lines = wrap(h.title, titleSize, 980);
  // Baseline of the first title line. Pulled down far enough that a 76px
  // ascender clears the kicker's baseline at y=160 even on a two-line title.
  const titleTop = 292 - (lines.length - 1) * (titleSize * 0.58);


  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b0f17"/>
      <stop offset="55%" stop-color="#101826"/>
      <stop offset="100%" stop-color="#0c2018"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${WIDTH}" height="8" fill="url(#glow)"/>
  <circle cx="1080" cy="140" r="220" fill="${BRAND}" opacity="0.07"/>
  <circle cx="1150" cy="520" r="160" fill="${ACCENT}" opacity="0.05"/>

  <image href="${LOGO_DATA_URI}" x="80" y="66" width="42" height="42"/>
  <g font-family="DejaVu Sans, sans-serif">
    <text x="134" y="112" fill="${BRAND}" font-size="30" font-weight="bold" letter-spacing="6">RIFTCOMPARE</text>
    <text x="80" y="160" fill="#94a3b8" font-size="26" letter-spacing="2">${esc(h.kicker.toUpperCase())}</text>
    ${lines
      .map(
        (l, i) =>
          `<text x="80" y="${titleTop + i * (titleSize * 1.16)}" fill="#ffffff" font-size="${titleSize}" font-weight="bold">${esc(l)}</text>`
      )
      .join("\n    ")}
    <rect x="80" y="${titleTop + lines.length * (titleSize * 1.16) - 26}" width="120" height="5" rx="2.5" fill="${BRAND}"/>
    ${h.chips
      .map(
        (c, i) =>
          `<text x="80" y="${titleTop + lines.length * (titleSize * 1.16) + 42 + i * 44}" fill="#cbd5e1" font-size="27">•  ${esc(c)}</text>`
      )
      .join("\n    ")}
  </g>

  ${motifSvg(h.motif ?? { kind: "bars" })}
</svg>`;
}

/**
 * Renders the right-hand graphic. Everything is right-aligned to x=1120 and kept
 * below y=430, which is the band the title and chips never reach (chips bottom
 * out at y≈554 on the left at x=80, and no chip is long enough to cross x≈700).
 */
function motifSvg(m: Motif): string {
  const R = WIDTH - 80; // 1120 — the right margin every motif hangs off
  const FONT = `font-family="DejaVu Sans, sans-serif"`;

  if (m.kind === "bars") {
    const bars = [
      { y: 470, w: 300, win: false },
      { y: 512, w: 200, win: true },
      { y: 554, w: 380, win: false },
    ];
    return `<g opacity="0.5">
    ${bars
      .map(
        (b) =>
          `<rect x="${R - b.w}" y="${b.y}" width="${b.w}" height="22" rx="11" fill="${b.win ? BRAND : "#1e293b"}"/>`
      )
      .join("\n    ")}
  </g>`;
  }

  if (m.kind === "date") {
    return `<g ${FONT} text-anchor="end">
    <rect x="${R - 340}" y="438" width="340" height="4" rx="2" fill="${BRAND}" opacity="0.6"/>
    <text x="${R}" y="486" fill="#94a3b8" font-size="24" letter-spacing="4">${esc(m.label.toUpperCase())}</text>
    <text x="${R}" y="556" fill="${BRAND}" font-size="62" font-weight="bold">${esc(m.big)}</text>
    <text x="${R}" y="596" fill="#cbd5e1" font-size="30" letter-spacing="2">${esc(m.sub)}</text>
  </g>`;
  }

  if (m.kind === "checklist") {
    // checklist — a tick per row, drawn as a stroked path rather than a "✓" glyph
    // so it cannot depend on what the rasterising font happens to carry.
    const rows = m.items.slice(0, 5);
    // Bottom-aligned to a fixed baseline rather than grown downward from a fixed
    // top: a fifth row starting at 470 would push its baseline to 614, hard against
    // the 630 edge. The label hangs off `top` for the same reason.
    const top = 596 - (rows.length - 1) * 36;
    return `<g ${FONT}>
    <text x="${R}" y="${top - 40}" fill="#94a3b8" font-size="22" letter-spacing="4" text-anchor="end">${esc(m.label.toUpperCase())}</text>
    ${rows
      .map((it, i) => {
        const y = top + i * 36;
        return `<text x="${R - 58}" y="${y}" fill="#cbd5e1" font-size="27" text-anchor="end">${esc(it)}</text>
    <path d="M ${R - 44} ${y - 10} l 9 10 l 18 -20" fill="none" stroke="${BRAND}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
      })
      .join("\n    ")}
  </g>`;
  }

  // grid — up to 9 tiles, 3 per row, each a distinctly-coloured pill. The one
  // motif where colour itself is the point (see the type's doc comment), so
  // tiles use a solid fill at reduced opacity plus a full-opacity top edge,
  // rather than the outline-only treatment the other motifs use — a thumbnail
  // this small needs the colour to read at a glance, not on close inspection.
  if (m.kind === "grid") {
    const TILE_W = 118;
    const TILE_H = 46;
    const GAP = 14;
    const COLS = 3;
    const tiles = m.items.slice(0, 9);
    const rowCount = Math.ceil(tiles.length / COLS);
    const gridW = COLS * TILE_W + (COLS - 1) * GAP;
    const gridH = rowCount * TILE_H + (rowCount - 1) * GAP;
    const left = R - gridW;
    // Bottom-aligned to y=620, same reasoning as checklist's `top`: growing
    // downward from a fixed top risks the last row crowding the 630 edge as the
    // item count (and therefore row count) varies per post.
    const gridTop = 620 - gridH;
    return `<g ${FONT}>
    <text x="${R}" y="${gridTop - 26}" fill="#94a3b8" font-size="22" letter-spacing="4" text-anchor="end">${esc(m.label.toUpperCase())}</text>
    ${tiles
      .map((it, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = left + col * (TILE_W + GAP);
        const y = gridTop + row * (TILE_H + GAP);
        return `<g>
      <rect x="${x}" y="${y}" width="${TILE_W}" height="${TILE_H}" rx="8" fill="${it.color}" opacity="0.22"/>
      <rect x="${x}" y="${y}" width="${TILE_W}" height="4" rx="2" fill="${it.color}"/>
      <text x="${x + TILE_W / 2}" y="${y + TILE_H / 2 + 8}" fill="#ffffff" font-size="20" font-weight="bold" text-anchor="middle">${esc(it.text)}</text>
    </g>`;
      })
      .join("\n    ")}
  </g>`;
  }

  // movers — same bottom-aligned row layout as checklist, but each row carries
  // a direction instead of a tick: a filled triangle pointing up (rising, brand
  // green) or down (falling, a red that reads against the dark background), or
  // a small diamond for "new" (accent blue — arrived, no prior direction to
  // show). Colour AND shape both carry meaning here, unlike checklist's uniform
  // ticks, which is what makes "the metagame is moving" legible at thumbnail
  // size rather than just "here is a list".
  const MOVER_DOWN = "#f87171";
  const moverRows = m.items.slice(0, 5);
  const moverTop = 596 - (moverRows.length - 1) * 36;
  const moverMark = (dir: "up" | "down" | "new", y: number): string => {
    const cx = R - 44;
    if (dir === "up") return `<path d="M ${cx - 10} ${y + 5} L ${cx} ${y - 13} L ${cx + 10} ${y + 5} Z" fill="${BRAND}"/>`;
    if (dir === "down") return `<path d="M ${cx - 10} ${y - 13} L ${cx} ${y + 5} L ${cx + 10} ${y - 13} Z" fill="${MOVER_DOWN}"/>`;
    return `<rect x="${cx - 7}" y="${y - 13}" width="14" height="14" rx="3" transform="rotate(45 ${cx} ${y - 6})" fill="${ACCENT}"/>`;
  };
  return `<g ${FONT}>
    <text x="${R}" y="${moverTop - 40}" fill="#94a3b8" font-size="22" letter-spacing="4" text-anchor="end">${esc(m.label.toUpperCase())}</text>
    ${moverRows
      .map((it, i) => {
        const y = moverTop + i * 36;
        return `<text x="${R - 58}" y="${y}" fill="#cbd5e1" font-size="27" text-anchor="end">${esc(it.text)}</text>
    ${moverMark(it.dir, y)}`;
      })
      .join("\n    ")}
  </g>`;
}

async function main() {
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("[gen-blog-heroes] sharp is required. Run `npm i -D sharp`.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const h of HEROES) {
    const out = path.join(OUT_DIR, `${h.slug}.png`);
    if (fs.existsSync(out) && !force) {
      console.log(`[gen-blog-heroes] ${h.slug}.png exists — skipping (pass --force to redraw)`);
      continue;
    }
    const buf = await sharp(Buffer.from(svgFor(h)))
      .png({ compressionLevel: 9, palette: true, quality: 88 })
      .toBuffer();
    fs.writeFileSync(out, buf);
    console.log(`[gen-blog-heroes] ${h.slug}.png (${Math.round(buf.length / 1024)}KB)`);
  }
  console.log("[gen-blog-heroes] done — run `npm run images:optimize` to emit the webp/avif renditions.");
}

void main();
