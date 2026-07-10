/**
 * Scrape the OFFICIAL Riftbound card gallery (playriftbound.com) for Vendetta cards
 * and save them to prisma/vendetta-cards.json for scripts/import-vendetta.ts.
 *
 * RUN THIS LOCALLY (the site is bot-protected; a real headless browser gets through
 * where curl/fetch don't). One-time setup if playwright isn't installed:
 *   npm i -D playwright && npx playwright install chromium
 * Then:
 *   npx tsx scripts/fetch-vendetta-official.ts
 *   DUMP=1 npx tsx scripts/fetch-vendetta-official.ts   # also saves every JSON
 *     response to scratch/vendetta-dump.json so the parser can be hardened if the
 *     auto-detector misses cards.
 *
 * HOW IT WORKS: the gallery is a JS app that loads its card data as JSON. We render
 * the page, capture every JSON network response, scroll to force lazy loads, and
 * auto-detect the card array (objects carrying a name + an image). We keep cards
 * whose set reads as Vendetta/VEN when a set field exists; if none exists we keep
 * everything and let the importer's VEN filter decide. DOM <img alt> extraction is
 * the fallback when no JSON is found.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const GALLERY = process.env.GALLERY_URL ?? "https://playriftbound.com/en-us/card-gallery/";
const OUT = join(process.cwd(), "prisma", "vendetta-cards.json");
const DUMP = process.env.DUMP === "1";

type Scraped = {
  name: string;
  imageUrl: string;
  set?: string;
  number?: string;
  rarity?: string;
  type?: string;
  domain?: string;
  energy?: number | null;
  might?: number | null;
};

// Best-effort key detection on unknown JSON shapes.
const pickStr = (o: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    // common nesting: { image: { url } } / { image: { large } }
    if (v && typeof v === "object") {
      const inner = v as Record<string, unknown>;
      for (const ik of ["url", "src", "large", "medium", "full"]) {
        if (typeof inner[ik] === "string" && (inner[ik] as string).trim()) return (inner[ik] as string).trim();
      }
    }
  }
  return undefined;
};
const pickNum = (o: Record<string, unknown>, keys: string[]): number | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (v && typeof v === "object") {
      const inner = v as Record<string, unknown>;
      for (const ik of keys) if (typeof inner[ik] === "number") return inner[ik] as number;
    }
  }
  return null;
};

function normalise(o: Record<string, unknown>): Scraped | null {
  const name = pickStr(o, ["name", "cardName", "title", "card_name"]);
  const imageUrl = pickStr(o, ["image", "imageUrl", "image_url", "img", "art", "cardImage", "thumbnail", "assets"]);
  if (!name || !imageUrl || !/^https?:\/\//.test(imageUrl)) return null;
  const domainRaw = pickStr(o, ["domain", "color", "colors", "faction", "region"]);
  return {
    name,
    imageUrl,
    set: pickStr(o, ["set", "setName", "set_name", "setCode", "set_id", "expansion"]),
    number: pickStr(o, ["number", "collectorNumber", "collector_number", "cardNumber", "card_number"]) ?? (pickNum(o, ["number", "collector_number"]) != null ? String(pickNum(o, ["number", "collector_number"])) : undefined),
    rarity: pickStr(o, ["rarity", "rarityName"]),
    type: pickStr(o, ["type", "cardType", "card_type", "supertype"]),
    domain: Array.isArray(o.colors) && typeof o.colors[0] === "string" ? (o.colors[0] as string) : domainRaw,
    energy: pickNum(o, ["energy", "cost", "energyCost"]),
    might: pickNum(o, ["might", "power"]),
  };
}

// Walk arbitrary JSON for arrays of >=5 card-looking objects.
function findCardArrays(node: unknown, found: Record<string, unknown>[][]): void {
  if (Array.isArray(node)) {
    if (node.length >= 5 && node.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const objs = node as Record<string, unknown>[];
      const hits = objs.filter((o) => normalise(o) !== null).length;
      if (hits >= Math.max(5, objs.length * 0.5)) found.push(objs);
    }
    for (const x of node) findCardArrays(x, found);
  } else if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) findCardArrays(v, found);
  }
}

async function main() {
  let chromium;
  try {
    // @ts-expect-error — playwright is an OPTIONAL, local-only dependency (this script
    // runs on the owner's machine, never in the deploy), so it isn't in package.json.
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Playwright not installed. Run:\n  npm i -D playwright && npx playwright install chromium");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1400, height: 1000 },
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

  // Best-effort: click a Vendetta set filter if the UI has one (harmless if not).
  for (const sel of ['text="Vendetta"', 'text="VEN"']) {
    try {
      await page.locator(sel).first().click({ timeout: 3000 });
      await page.waitForTimeout(2500);
      console.log(`Clicked filter ${sel}`);
      break;
    } catch {
      /* no such filter — fine */
    }
  }

  // Scroll to trigger lazy loading / pagination.
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 2400);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2000);

  if (DUMP) {
    mkdirSync(join(process.cwd(), "scratch"), { recursive: true });
    writeFileSync(join(process.cwd(), "scratch", "vendetta-dump.json"), JSON.stringify(jsonBodies, null, 1));
    console.log(`Dumped ${jsonBodies.length} JSON responses to scratch/vendetta-dump.json`);
    // Print an inline summary so the dump can be inspected straight from CI logs
    // (artifact downloads aren't always reachable from the authoring environment).
    for (const r of jsonBodies) {
      const s = JSON.stringify(r.body);
      console.log(`DUMP-URL: ${r.url}`);
      console.log(`DUMP-SIZE: ${s.length}`);
      console.log(`DUMP-HEAD: ${s.slice(0, 700)}`);
      console.log("---");
    }
    // Also sample the DOM around gallery images — enough markup to write a precise
    // extractor when the JSON route yields nothing.
    const domSamples = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .filter((img) => (img.alt || "").length > 10)
        .slice(0, 4)
        .map((img) => {
          const container = img.closest("li, article, [class*='card' i]") ?? img.parentElement;
          return (container?.outerHTML ?? "").slice(0, 1200);
        })
    );
    domSamples.forEach((h: string, i: number) => console.log(`DOM-SAMPLE ${i}:\n${h}\n===`));
  }

  // 1) Prefer JSON card arrays.
  const arrays: Record<string, unknown>[][] = [];
  for (const { body } of jsonBodies) findCardArrays(body, arrays);
  arrays.sort((a, b) => b.length - a.length);
  let cards: Scraped[] = [];
  if (arrays.length) {
    const seen = new Set<string>();
    for (const arr of arrays) {
      for (const o of arr) {
        const c = normalise(o);
        if (!c) continue;
        const key = `${c.name}|${c.number ?? c.imageUrl}`;
        if (!seen.has(key)) {
          seen.add(key);
          cards.push(c);
        }
      }
    }
    console.log(`JSON auto-detect: ${cards.length} cards from ${arrays.length} candidate arrays.`);
  }

  // 2) DOM fallback: gallery <img> tags with meaningful alt text.
  if (cards.length < 5) {
    const dom = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img"))
        .map((img) => ({ name: (img.alt || "").trim(), imageUrl: img.currentSrc || img.src }))
        .filter((x) => x.name.length > 2 && !/logo|icon|riot|banner/i.test(x.name) && /^https?:/.test(x.imageUrl))
    );
    const seen = new Set(cards.map((c) => c.name));
    for (const d of dom) if (!seen.has(d.name)) cards.push(d);
    console.log(`DOM fallback added ${dom.length} images (metadata will be missing — importer will report).`);
  }

  await browser.close();

  // Keep Vendetta rows when a set field exists; keep everything otherwise.
  const ven = cards.filter((c) => !c.set || /vendetta|(^|\b)ven(\b|$)/i.test(c.set));
  writeFileSync(OUT, JSON.stringify(ven, null, 1));
  console.log(`Saved ${ven.length} cards to prisma/vendetta-cards.json`);
  if (ven.length === 0) console.log("0 cards — re-run with DUMP=1 and share scratch/vendetta-dump.json so the parser can be hardened.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
