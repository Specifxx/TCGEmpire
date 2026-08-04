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

interface Hero {
  slug: string;
  kicker: string;
  title: string;
  /** Up to three short stat/label chips drawn along the bottom. */
  chips: string[];
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

  // Decorative "price comparison" motif: three bars, the cheapest highlighted.
  const bars = [
    { y: 470, w: 300, win: false },
    { y: 512, w: 200, win: true },
    { y: 554, w: 380, win: false },
  ];

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

  <g font-family="DejaVu Sans, sans-serif">
    <text x="80" y="112" fill="${BRAND}" font-size="30" font-weight="bold" letter-spacing="6">RIFTCOMPARE</text>
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

  <g opacity="0.5">
    ${bars
      .map(
        (b) =>
          `<rect x="${WIDTH - 80 - b.w}" y="${b.y}" width="${b.w}" height="22" rx="11" fill="${b.win ? BRAND : "#1e293b"}"/>`
      )
      .join("\n    ")}
  </g>
</svg>`;
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
