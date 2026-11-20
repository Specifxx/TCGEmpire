// Collector printings our catalogue was missing (owner, 2026-11-20: "these cards are
// out there and they need to be in our database"): the K/DA Couture Collection, the
// T1 Worlds Champion Player Bundle, the Worlds Bundle 2025 oversized Battlefields,
// Secret Garden, judge and other promotional singles TCGplayer sells.
//
// Runs in GitHub Actions only (collab-cards.yml): the cloud sessions that maintain
// this repo cannot reach TCGplayer or Riot's gallery. Database-free.
//
//   MODE=discover  prints, as JSON lines, every TCGplayer single no card of ours
//                  lands on (the importer's own matcher over data/public/cards.json),
//                  and every card in Riot's official gallery whose id we lack.
//   MODE=images    downloads each image named in data/collab-cards/images.json,
//                  crops it to the card (sharp trim of the flat background), and
//                  writes public/collab-cards/<file>.jpg. Riot's gallery is the
//                  source wherever it has the card (Riot's Fan Content terms, the
//                  same footing as the T1 card fronts in public/t1-worlds-cards/);
//                  TCGplayer's own product image only where it does not.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTcgplayerRows, fetchTcgplayerProducts, tcgImageUrl, type TcgMatchCard, type TcgProduct } from "../src/lib/tcgplayer";

const MODE = process.env.MODE || "discover";
const GALLERY = "https://playriftbound.com/en-us/card-gallery/";
const UA = "Mozilla/5.0 (compatible; RiftCompareCatalogue/1.0; +https://riftcompare.com)";

type PubCard = TcgMatchCard & { slug: string; name: string; externalId: string | null; imageUrl: string | null };

async function gallery(): Promise<Record<string, unknown>[]> {
  const r = await fetch(GALLERY, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
  const html = await r.text();
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, any>;
    if (typeof o.id === "string" && typeof o.name === "string" && typeof o.cardImage?.url === "string" && !seen.has(o.id)) {
      seen.add(o.id);
      if (seen.size <= 2) console.log("RAW " + JSON.stringify(o).slice(0, 2500));
      out.push({
        id: o.id,
        name: o.name,
        set: o.set?.value?.id ?? o.set?.id ?? o.set?.label ?? null,
        number: o.publicCode ?? o.collectorNumber ?? null,
        rarity: o.rarity?.value?.id ?? o.rarity?.label ?? null,
        type: o.cardType?.type?.map?.((t: any) => t.id ?? t.label) ?? null,
        domain: o.domain?.values?.map?.((d: any) => d.id ?? d.label) ?? null,
        energy: o.energy?.value?.id ?? null,
        might: o.might?.value?.id ?? null,
        text: o.text?.richText?.body ?? null,
        image: o.cardImage.url,
        orientation: o.orientation ?? null,
      });
    }
    for (const v of Object.values(o)) walk(v);
  };
  for (const m of html.matchAll(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* not JSON */
    }
  }
  console.log(`gallery: HTTP ${r.status}, ${html.length} bytes, ${out.length} cards`);
  return out;
}

async function discover() {
  const cards = JSON.parse(readFileSync("data/public/cards.json", "utf8")) as PubCard[];
  const products = await fetchTcgplayerProducts();
  const unmatched: TcgProduct[] = [];
  await buildTcgplayerRows(undefined, products, { cards, unmatched, matchedIds: new Set() });
  const singles = unmatched.filter((p) => /\d/.test(p.customAttributes?.number ?? "") && !/^T\d/i.test(p.customAttributes?.number ?? ""));
  console.log(`tcgplayer: ${products.length} products, ${unmatched.length} unmatched, ${singles.length} numbered singles`);
  for (const p of singles) {
    console.log(
      "TCG " +
        JSON.stringify({
          id: p.productId,
          name: p.productName,
          num: p.customAttributes?.number ?? null,
          rarity: p.customAttributes?.rarityDbName ?? null,
          set: p.setName,
          market: p.marketPrice,
          low: p.lowestPrice,
          url: p.productUrlName,
        })
    );
  }
  // Our cards' TCGplayer pins that already exist, so the T1S collection's printings
  // (made by hand, never linked) can be pinned in PROMO_PRODUCT_OVERRIDES.
  const have = new Set(cards.map((c) => (c.externalId ?? "").toLowerCase()));
  const g = await gallery();
  for (const c of g) {
    if (have.has(String(c.id).toLowerCase())) continue;
    console.log("GAL " + JSON.stringify(c));
  }
}

async function images() {
  const sharp = (await import("sharp")).default;
  const list = JSON.parse(readFileSync("data/collab-cards/images.json", "utf8")) as { file: string; url?: string; tcg?: number }[];
  const dir = join("public", "collab-cards");
  mkdirSync(dir, { recursive: true });
  for (const it of list) {
    const url = it.url ?? (it.tcg ? tcgImageUrl(it.tcg) : null);
    if (!url) continue;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      // Trim the flat background TCGplayer's square images pad the card with, then
      // keep the card at most 744px wide (the T1 card fronts' size).
      const out = await sharp(buf).flatten({ background: "#ffffff" }).trim({ threshold: 18 }).resize({ width: 744, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      const meta = await sharp(out).metadata();
      writeFileSync(join(dir, `${it.file}.jpg`), out);
      console.log(`IMG ${it.file}.jpg ${meta.width}x${meta.height} ${out.length} bytes from ${url}`);
    } catch (e) {
      console.log(`IMG-FAIL ${it.file} ${url}: ${(e as Error).message}`);
    }
  }
}

(MODE === "images" ? images() : discover()).catch((e) => {
  console.error(e);
  process.exit(1);
});
