#!/usr/bin/env tsx
/**
 * Generates the featured image for the "RiftCompare Premium, Explained" blog
 * post — the one hero in the blog that isn't card art (no card is what the
 * article is about) and isn't the generic kicker/title/chips template
 * scripts/gen-blog-heroes.ts draws for other feature-less articles either:
 * the user asked for this one specifically to show the real RiftCompare
 * logo alongside the real Premium badge, not an abstract banner.
 *
 * Composites the site's own /public/logo-r-green.png (the exact asset
 * BrandLogo.tsx renders everywhere else, already green with real alpha —
 * see that component's own comment) onto a brand-palette background,
 * next to the real "RiftCompare" wordmark and a gold "✦ PREMIUM" chip
 * styled identically to the chip's real Tailwind class on /premium
 * (`chip bg-gold/15 text-gold`, gold = tailwind.config.ts's `gold: #caa85a`).
 *
 * Output: 1200x630 (OG ratio) at public/blog/riftcompare-premium-explained.png.
 * Idempotent: skips if the file exists. Pass --force to redraw.
 *
 * Run: npx tsx scripts/gen-premium-hero.ts [--force]
 * Then: npm run images:optimize
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "blog", "riftcompare-premium-explained.png");
const LOGO = path.join(process.cwd(), "public", "logo-r-green.png");

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND = "#34d17e";
const ACCENT = "#38bdf8";
const GOLD = "#caa85a";

function backgroundSvg(): string {
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
  <circle cx="1040" cy="150" r="240" fill="${BRAND}" opacity="0.07"/>
  <circle cx="1120" cy="520" r="170" fill="${ACCENT}" opacity="0.05"/>
  <circle cx="150" cy="560" r="200" fill="${GOLD}" opacity="0.05"/>

  <g font-family="DejaVu Sans, sans-serif">
    <!-- Wordmark, right of where the real logo mark gets composited (x≈120..300) -->
    <text x="330" y="290" fill="#ffffff" font-size="72" font-weight="bold">Rift<tspan fill="${BRAND}">Compare</tspan></text>

    <!-- Gold PREMIUM chip — same visual language as the real chip on /premium
         (bg-gold/15, gold text, uppercase, bold, rounded-full) -->
    <rect x="330" y="330" width="230" height="52" rx="26" fill="${GOLD}" fill-opacity="0.15" stroke="${GOLD}" stroke-opacity="0.55" stroke-width="1.5"/>
    <text x="445" y="365" fill="${GOLD}" font-size="26" font-weight="bold" letter-spacing="3" text-anchor="middle">✦ PREMIUM</text>

    <!-- Kicker above the wordmark -->
    <text x="330" y="210" fill="#94a3b8" font-size="28" letter-spacing="3">EXPLAINER · WHAT'S INCLUDED</text>

    <!-- Title line -->
    <text x="80" y="470" fill="#ffffff" font-size="54" font-weight="bold">Everything You Get With</text>
    <text x="80" y="530" fill="${GOLD}" font-size="54" font-weight="bold">RiftCompare Premium</text>

    <text x="80" y="580" fill="#cbd5e1" font-size="26">Every feature, every price, every screenshot</text>
  </g>
</svg>`;
}

async function main() {
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("[gen-premium-hero] sharp is required. Run `npm i -D sharp`.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (fs.existsSync(OUT) && !force) {
    console.log(`[gen-premium-hero] ${path.basename(OUT)} exists — skipping (pass --force to redraw)`);
    return;
  }

  const bg = sharp(Buffer.from(backgroundSvg()));

  // The real brand mark, same asset BrandLogo.tsx renders everywhere else —
  // resized to a clean 190px square and placed top-left of the wordmark, at
  // the same baseline logic as CinematicHero's own "logo + wordmark" lockup.
  const logo = await sharp(LOGO).resize(190, 190, { fit: "contain" }).toBuffer();

  const buf = await bg
    .composite([{ input: logo, left: 88, top: 150 }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();

  fs.writeFileSync(OUT, buf);
  console.log(`[gen-premium-hero] ${path.basename(OUT)} (${Math.round(buf.length / 1024)}KB)`);
  console.log("[gen-premium-hero] done — run `npm run images:optimize` to emit the webp/avif renditions.");
}

void main();
