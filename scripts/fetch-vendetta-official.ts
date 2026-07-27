/**
 * Scrape the OFFICIAL Riftbound card gallery (playriftbound.com) for Vendetta cards
 * and save them to prisma/vendetta-cards.json for scripts/import-vendetta.ts.
 *
 * Designed for CI (see .github/workflows/maintenance.yml). How it reads the gallery:
 *  - Card images are official Riot CDN assets; each <img alt> is structured as
 *    "Riftbound {Type}: {Name}. {rules text}" → type + name parsed from there.
 *  - Domain and rarity aren't in the alt text, so we derive them from the gallery's
 *    OWN filters: with the Vendetta set filter on, click each domain/rarity filter in
 *    turn and record which cards remain visible. Official filters = accurate data.
 *  - "Coming Soon" placeholders are skipped.
 *
 * DUMP=1 additionally prints captured JSON responses + DOM samples to the log and
 * writes scratch/vendetta-dump.json (for parser hardening from CI logs).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const GALLERY = process.env.GALLERY_URL ?? "https://playriftbound.com/en-us/card-gallery/";
const OUT = join(process.cwd(), "prisma", "vendetta-cards.json");
const DUMP = process.env.DUMP === "1";

type Scraped = {
  name: string;
  imageUrl: string;
  set: string;
  cardId?: string; // official gallery id, e.g. "ven-021-166" / "ven-r01"
  number?: string; // id segment, e.g. "021", "021a", "r01"
  code?: string; // official collector code, e.g. "021/166", "R01"
  type?: string;
  domain?: string;
  rarity?: string;
  rules?: string;
  energy?: number | null;
  might?: number | null;
};

// "Riftbound Unit: Akali, Deadly Weapon. [Empower] …" → { type: "Unit", name: "Akali, Deadly Weapon", rules }
function parseAlt(alt: string): { type: string; name: string; rules: string } | null {
  const m = alt.match(/^Riftbound\s+([A-Za-z][A-Za-z ]*?):\s+(.+)$/s);
  if (!m) return null;
  const typeRaw = m[1].toLowerCase();
  const type = typeRaw.includes("unit")
    ? "Unit"
    : typeRaw.includes("spell")
    ? "Spell"
    : typeRaw.includes("gear")
    ? "Gear"
    : typeRaw.includes("rune")
    ? "Rune"
    : typeRaw.includes("battlefield")
    ? "Battlefield"
    : typeRaw.includes("legend") || typeRaw.includes("champion")
    ? "Legend"
    : "";
  if (!type) return null;
  const rest = m[2];
  // Name runs to the first sentence break. Names contain commas ("Akali, Deadly
  // Weapon") but not periods; "[NO TEXT]" runes have "Name. [NO TEXT]".
  const dot = rest.indexOf(". ");
  const name = (dot === -1 ? rest.replace(/\.\s*$/, "") : rest.slice(0, dot)).trim();
  const rules = dot === -1 ? "" : rest.slice(dot + 2).trim();
  if (!name || /coming soon/i.test(name)) return null;
  return { type, name, rules };
}

async function main() {
  let chromium;
  try {
    // @ts-expect-error — playwright is an OPTIONAL dependency (installed in CI just
    // for this task), so it isn't in package.json.
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

  const jsonBodies: { url: string; body: unknown }[] = [];
  page.on("response", async (res: { headers: () => Record<string, string>; json: () => Promise<unknown>; url: () => string }) => {
    try {
      const ct = res.headers()["content-type"] ?? "";
      if (!ct.includes("json")) return;
      const body = await res.json().catch(() => null);
      if (body) jsonBodies.push({ url: res.url(), body });
    } catch {
      /* ignore */
    }
  });

  console.log(`Loading ${GALLERY} …`);
  await page.goto(GALLERY, { waitUntil: "networkidle", timeout: 90_000 });

  // Dismiss the cookie banner so it can't intercept filter clicks.
  for (const label of ["Accept All", "Accept"]) {
    try {
      await page.locator(`button:has-text("${label}")`).first().click({ timeout: 2500 });
      console.log(`Dismissed cookie banner via "${label}"`);
      break;
    } catch {
      /* not present */
    }
  }

  // Log the clickable filter candidates once — makes the next hardening round easy.
  const filterTexts: string[] = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("button, [role='button'], label, li, a"));
    const texts = els.map((e) => (e.textContent ?? "").trim()).filter((t) => t && t.length <= 24);
    return Array.from(new Set(texts)).slice(0, 100);
  });
  console.log("FILTER-CANDIDATES:", JSON.stringify(filterTexts));

  async function clickFilter(label: string): Promise<boolean> {
    const sels = [
      `button:has-text("${label}")`,
      `[role="checkbox"]:has-text("${label}")`,
      `label:has-text("${label}")`,
      `li:has-text("${label}")`,
      `text="${label}"`,
    ];
    for (const sel of sels) {
      try {
        await page.locator(sel).first().click({ timeout: 2500 });
        await page.waitForTimeout(1600);
        return true;
      } catch {
        /* try next selector */
      }
    }
    // Last resort: exact text node.
    try {
      await page.getByText(label, { exact: true }).first().click({ timeout: 2500 });
      await page.waitForTimeout(1600);
      return true;
    } catch {
      return false;
    }
  }

  async function scrollAll(): Promise<void> {
    for (let i = 0; i < 25; i++) {
      await page.mouse.wheel(0, 2600);
      await page.waitForTimeout(450);
    }
    await page.mouse.wheel(0, -100000); // back to top so the next filter click is visible
    await page.waitForTimeout(800);
  }

  async function snapshot(): Promise<{ alt: string; src: string; cardId: string }[]> {
    await scrollAll();
    return page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .map((img) => ({
          alt: (img.alt || "").trim(),
          src: img.currentSrc || img.src,
          cardId: (img.closest("[data-card-id]")?.getAttribute("data-card-id") ?? "").trim(),
        }))
        .filter((x) => x.alt.startsWith("Riftbound") && /^https?:/.test(x.src))
    );
  }

  // Set filter: Vendetta.
  const venClicked = await clickFilter("Vendetta");
  console.log(venClicked ? "Set filter: Vendetta ON" : "WARN: could not click a Vendetta filter — capturing everything; importer guards handle bleed.");

  // The domain/rarity filters live behind a "Show Filters" toggle — open it, then log
  // what became clickable (drives the next hardening round if labels differ).
  const filtersOpened = await clickFilter("Show Filters");
  console.log(filtersOpened ? "Filter panel opened" : "WARN: no Show Filters button found");
  const panelTexts: string[] = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("button, [role='button'], [role='checkbox'], label, li, span"));
    const texts = els.map((e) => (e.textContent ?? "").trim()).filter((t) => t && t.length <= 22);
    return Array.from(new Set(texts)).slice(0, 140);
  });
  console.log("PANEL-CANDIDATES:", JSON.stringify(panelTexts));
  // Mine one card's ancestor markup for domain hints (class/data attributes).
  const ancestry: string = await page.evaluate(() => {
    const img = Array.from(document.querySelectorAll("img")).find((i) => (i.alt || "").startsWith("Riftbound"));
    if (!img) return "no card img";
    let el: Element | null = img.parentElement;
    const out: string[] = [];
    for (let i = 0; i < 5 && el; i++) {
      const attrs = Array.from(el.attributes).map((a) => `${a.name}="${a.value.slice(0, 80)}"`).join(" ");
      out.push(`<${el.tagName.toLowerCase()} ${attrs}>`);
      el = el.parentElement;
    }
    return out.join("\n");
  });
  console.log("CARD-ANCESTRY:\n" + ancestry);

  // Baseline: every Vendetta card (unfiltered by domain/rarity).
  const base = await snapshot();
  console.log(`Baseline snapshot: ${base.length} card images`);

  // The full card objects live in the page's __NEXT_DATA__ (confirmed schema):
  //   { id: "ven-021-166", name, publicCode: "VEN-021/166",
  //     set: { value: { id: "VEN" } }, rarity: { value: { label: "Epic" } },
  //     domain: { values: [{ label: "Fury" }] }, cardType: { type: [{ label: "Unit" }] },
  //     cardImage: { url, accessibilityText }, ... }
  // Extract every VEN card straight from it — authoritative names, numbers, domains,
  // rarities, types, full-res official images and rules text.
  type JsonCard = {
    cardId: string;
    name: string;
    code?: string; // "021/166" | "R01"
    number?: string; // id segment: "021", "021a", "r01"
    domain?: string;
    rarity?: string;
    type?: string;
    imageUrl?: string;
    rules?: string;
    energy?: number | null;
    might?: number | null;
  };
  const jsonCards: JsonCard[] = [];
  const seenIds = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, any>;
    const id = typeof o.id === "string" ? o.id.toLowerCase() : "";
    const setId = o?.set?.value?.id;
    if (/^ven-/.test(id) && typeof o.name === "string" && o.cardImage && setId === "VEN") {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        // TEMP DEBUG: dump the full raw object for the first Legend card so we can find
        // whichever field carries the champion attribution (e.g. "Shen" for "Eye of
        // Twilight") — the card frame shows it separately from `name`, and we need the
        // real key name before we can enrich Legend names correctly.
        if (process.env.DEBUG_LEGEND === "1" && o?.cardType?.type?.[0]?.label === "Legend" && !(global as any).__loggedLegend) {
          (global as any).__loggedLegend = true;
          console.log("LEGEND-RAW-OBJECT:", JSON.stringify(o, null, 2).slice(0, 6000));
        }
        // Stats live under varying keys but always as { label: "Energy"|"Might"|"Power", value: { id: number } }.
        let energy: number | null = null;
        let might: number | null = null;
        for (const v of Object.values(o)) {
          const lbl = (v as any)?.label;
          const num = (v as any)?.value?.id;
          if (typeof num !== "number") continue;
          if (lbl === "Energy" || lbl === "Cost") energy = num;
          if (lbl === "Might") might = num;
        }
        const alt = String(o.cardImage?.accessibilityText ?? "");
        const parsedAlt = parseAlt(alt);
        jsonCards.push({
          cardId: id,
          name: String(o.name),
          code: typeof o.publicCode === "string" ? o.publicCode.replace(/^VEN-/i, "") : undefined,
          number: id.match(/^ven-([a-z]?\d+[a-z]?|r\d+[a-z]?)/i)?.[1],
          domain: o?.domain?.values?.[0]?.label,
          rarity: o?.rarity?.value?.label,
          type: o?.cardType?.type?.[0]?.label,
          imageUrl: typeof o.cardImage?.url === "string" ? o.cardImage.url : undefined,
          rules: parsedAlt?.rules?.slice(0, 500) || undefined,
          energy,
          might,
        });
      }
    }
    for (const v of Object.values(o)) walk(v);
  };
  const scripts: { id: string; len: number; text: string }[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("script"))
      .filter((sc) => sc.id === "__NEXT_DATA__" || sc.type === "application/json")
      .map((sc) => ({ id: sc.id || sc.type || "inline", len: (sc.textContent ?? "").length, text: (sc.textContent ?? "") }))
      .filter((x) => x.len > 1000)
      .slice(0, 4)
  );
  for (const sc of scripts) {
    try {
      walk(JSON.parse(sc.text));
    } catch {
      /* not parseable */
    }
  }
  console.log(`__NEXT_DATA__ extraction: ${jsonCards.length} official VEN cards`);
  if (jsonCards.length) console.log("SAMPLE:", JSON.stringify(jsonCards[0]));

  if (DUMP) {
    mkdirSync(join(process.cwd(), "scratch"), { recursive: true });
    writeFileSync(join(process.cwd(), "scratch", "vendetta-dump.json"), JSON.stringify(jsonBodies, null, 1));
    for (const r of jsonBodies) {
      const s = JSON.stringify(r.body);
      if (s.length < 300) continue;
      console.log(`DUMP-URL: ${r.url}\nDUMP-SIZE: ${s.length}\nDUMP-HEAD: ${s.slice(0, 400)}\n---`);
    }
  }

  await browser.close();

  // Prefer the authoritative __NEXT_DATA__ extraction; fall back to alt parsing
  // only if the embedded data ever disappears.
  let cards: Scraped[];
  if (jsonCards.length >= 10) {
    cards = jsonCards.map((c) => ({
      name: c.name,
      imageUrl: c.imageUrl ?? "",
      set: "VEN",
      cardId: c.cardId,
      number: c.number,
      code: c.code,
      type: c.type,
      domain: c.domain,
      rarity: c.rarity,
      rules: c.rules,
      energy: c.energy,
      might: c.might,
    }));
  } else {
    console.log("WARN: __NEXT_DATA__ yielded too few cards — falling back to alt-text parsing (no domain/rarity).");
    const seenSrc = new Set<string>();
    cards = [];
    for (const { alt, src, cardId } of base) {
      if (seenSrc.has(src)) continue;
      seenSrc.add(src);
      const parsed = parseAlt(alt);
      if (!parsed) continue;
      cards.push({
        name: parsed.name,
        imageUrl: src,
        set: "VEN",
        cardId: cardId || undefined,
        number: cardId ? cardId.replace(/^ven-/i, "") : undefined,
        type: parsed.type,
        rules: parsed.rules.slice(0, 500),
      });
    }
  }

  writeFileSync(OUT, JSON.stringify(cards, null, 1));
  const withDomain = cards.filter((c) => c.domain).length;
  const withRarity = cards.filter((c) => c.rarity).length;
  console.log(`Saved ${cards.length} cards (${withDomain} with domain, ${withRarity} with rarity) to prisma/vendetta-cards.json`);

  // Compact census — one line per card, sorted by collector number — so a CI log is
  // enough to see the full revealed set (chase-tier classification, spoiler tracking)
  // without downloading the artifact.
  const numOf = (c: Scraped) => parseInt((c.number ?? "").match(/^\d+/)?.[0] ?? "9999", 10);
  for (const c of [...cards].sort((a, b) => numOf(a) - numOf(b))) {
    console.log(`CARD ${(c.number ?? "?").padEnd(6)} ${(c.rarity ?? "?").padEnd(10)} ${(c.domain ?? "?").padEnd(8)} ${c.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
