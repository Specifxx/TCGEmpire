// Diagnostic probe for the Crystal Commerce candidates in
// src/lib/pending-platforms.ts — NOT a production scraper. Its only job is to
// fetch a few already-confirmed real URLs per candidate and print back what
// their actual response looks like (status, content-type, a raw snippet, and
// whether a `.json` sibling URL exists), so whoever writes the real adapter
// has real data to design against instead of guessing.
//
// This sandbox's egress policy blocks every third-party domain, so this has
// only been syntax/import-checked here, never actually run against a live
// site — run it somewhere with real internet access (CI, a dev machine) and
// read the output before writing a single line of parsing logic.
//
// Respects robots.txt and rate-limits like the real importer (see
// lib/scrape-http.ts) — this is exploratory, not high-volume, but there's no
// reason for a diagnostic pass to be any less polite than the real scraper.
export {};
import { SCRAPE_HEADERS as UA, sleep, REQUEST_DELAY_MS, isRateLimited, robotsAllows } from "../src/lib/scrape-http";
import { PENDING_US_STORES } from "../src/lib/pending-platforms";

const PRICE_PATTERN = /\$\s?\d+\.\d{2}/g;

async function inspect(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: UA });
  } catch (e) {
    return `  ${url}\n    ERR ${(e as Error).message}`;
  }
  if (isRateLimited(res)) return `  ${url}\n    429 rate-limited — back off, don't retry.`;
  const contentType = res.headers.get("content-type") ?? "unknown";
  if (!res.ok) return `  ${url}\n    HTTP ${res.status} (${contentType})`;
  const text = await res.text();
  const priceHits = text.match(PRICE_PATTERN)?.slice(0, 5) ?? [];
  const looksJson = contentType.includes("json");
  const snippet = text.slice(0, 300).replace(/\s+/g, " ");
  return (
    `  ${url}\n` +
    `    HTTP ${res.status} (${contentType}), ${text.length} bytes\n` +
    `    price-like matches: ${priceHits.length ? priceHits.join(", ") : "none found"}\n` +
    `    snippet: ${looksJson ? snippet : snippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}`
  );
}

(async () => {
  for (const store of PENDING_US_STORES) {
    console.log(`\n=== ${store.name} (${store.base}) — platform guess: ${store.platform}, confidence: ${store.confidence} ===`);
    const allowed = await robotsAllows(store.base);
    for (const path of store.confirmedPaths) {
      if (!allowed(path)) {
        console.log(`  ${path}\n    robots.txt disallows this path — skipped.`);
        continue;
      }
      console.log(await inspect(`${store.base}${path}`));
      await sleep(REQUEST_DELAY_MS);
      // Cheap check for a Shopify-style JSON sibling — informative either way,
      // costs one extra request.
      if (allowed(`${path}.json`)) {
        console.log(await inspect(`${store.base}${path}.json`));
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }
})();
