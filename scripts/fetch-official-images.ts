/**
 * Scrape the OFFICIAL Riftbound card gallery (playriftbound.com) for every card's
 * real image, across EVERY set — no set filter is clicked. fetch-vendetta-official.ts
 * already proved the gallery's __NEXT_DATA__ embeds full card objects (id, name,
 * cardImage.url, ...) that can be walked straight out of the page without pagination;
 * this just skips that script's "Vendetta" filter click so every set's cards show up
 * in the same walk, keyed by the gallery's own id ("ven-021-166", "sfd-r04a", "unl-r06b").
 *
 * Why this exists: scripts/add-tcg-printings.ts (and the older add-promos.ts) clone
 * promo/rune printings that TCGplayer lists but RiftScribe doesn't catalogue, and had
 * no independent image source — they reuse a donor card's art, sometimes from a
 * DIFFERENT set's version of the same rune, which is the wrong specific artwork.
 * scripts/fix-cloned-art.ts uses this file to replace that borrowed photo with the
 * real one where the official gallery has it, or fall back to the generated CardArt
 * placeholder (not a wrong photo) where it doesn't.
 *
 * Usage: npx tsx scripts/fetch-official-images.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const GALLERY = process.env.GALLERY_URL ?? "https://playriftbound.com/en-us/card-gallery/";
const OUT = join(process.cwd(), "prisma", "official-images.json");

async function main() {
  let chromium;
  try {
    // playwright used to be an OPTIONAL dependency not listed in package.json
    // (hence the try/catch below), but the homepage-rebuild task's audit
    // tooling added it as a real devDependency (pinned to 1.56.1 — see
    // DECISIONS.md), so the dynamic import now type-checks on its own and no
    // longer needs a @ts-expect-error escape hatch. The try/catch itself
    // stays: this script must still degrade gracefully wherever playwright
    // genuinely isn't installed (e.g. a minimal CI image).
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Playwright not installed. Run:\n  npm i --no-save playwright && npx playwright install --with-deps chromium");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1500, height: 1100 },
  });

  console.log(`Loading ${GALLERY} …`);
  await page.goto(GALLERY, { waitUntil: "networkidle", timeout: 90_000 });

  for (const label of ["Accept All", "Accept"]) {
    try {
      await page.locator(`button:has-text("${label}")`).first().click({ timeout: 2500 });
      console.log(`Dismissed cookie banner via "${label}"`);
      break;
    } catch {
      /* not present */
    }
  }

  // Scroll the (unfiltered) gallery so any lazy-loaded images/data hydrate — harmless
  // if __NEXT_DATA__ already has the full catalogue server-rendered.
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 2600);
    await page.waitForTimeout(300);
  }

  // Same __NEXT_DATA__ shape fetch-vendetta-official.ts relies on:
  //   { id: "ven-021-166" | "sfd-r04a" | ..., name, cardImage: { url, accessibilityText } }
  // No `set` check here (that script's setId === "VEN" gate is exactly what we're
  // dropping) — every set's cards fall out of the same walk.
  const images: { id: string; imageUrl: string }[] = [];
  const seenIds = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, any>;
    const id = typeof o.id === "string" ? o.id.toLowerCase() : "";
    if (/^[a-z]{2,4}-r?\d+[a-z]?/.test(id) && typeof o.name === "string" && typeof o.cardImage?.url === "string") {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        images.push({ id, imageUrl: String(o.cardImage.url) });
      }
    }
    for (const v of Object.values(o)) walk(v);
  };
  const scripts: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script"))
      .filter((sc) => sc.id === "__NEXT_DATA__" || sc.type === "application/json")
      .map((sc) => sc.textContent ?? "")
      .filter((t) => t.length > 1000)
  );
  for (const text of scripts) {
    try {
      walk(JSON.parse(text));
    } catch {
      /* not parseable */
    }
  }

  await browser.close();

  console.log(`__NEXT_DATA__ extraction: ${images.length} card images across all sets`);
  const bySet: Record<string, number> = {};
  for (const c of images) {
    const sc = c.id.split("-")[0];
    bySet[sc] = (bySet[sc] ?? 0) + 1;
  }
  console.log("By set:", JSON.stringify(bySet));

  // Guard against silently shrinking the file if the gallery didn't fully hydrate
  // this run (network hiccup, layout change) — better to keep last run's data than
  // overwrite it with a thin scrape.
  if (images.length < 300) {
    console.error(`Only found ${images.length} images (expected 300+ across sets) — NOT writing ${OUT}, keeping the previous file so a bad scrape can't wipe good data.`);
    process.exit(1);
  }

  mkdirSync(join(process.cwd(), "prisma"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(images, null, 0));
  console.log(`Saved ${images.length} official images to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
