#!/usr/bin/env node
// Stage 1: which candidate sites are Shopify storefronts, and where do they sell?
// Reads /meta.json (public on every Shopify store: myshopify_domain, country,
// currency), falls back to /products.json?limit=1, and sniffs the homepage of
// anything that is not Shopify so the exclusion has a reason.
import { parseArgs, usage, loadConfig, setHttp, politeGet, get, json, pool, hostOf, marketOf, writeJson, stats } from "./lib.mjs";
import fs from "node:fs";

const opts = parseArgs();
usage(`
Usage: node detect-shopify.mjs <candidates> <out.json> [--config game.json] [--known file]
                               [--concurrency 8] [--delay 300] [--timeout 20000] [--ua "..."]
  <candidates>  .json array of {name?, base, country?} (or of URL strings), or a .txt
                file with one "CC|Name|https://..." or bare URL per line (# comments ok).
  --known       any text file (e.g. the sister site's src/lib/stores.ts); every https
                origin in it counts as already registered. Matched by host AND by
                myshopify domain (a store registered under its *.myshopify.com host
                is still caught when found again under its own domain).
`, opts);
const [inFile, outFile] = opts._;
const cfg = opts.config ? loadConfig(opts.config) : null;
const net = setHttp(opts);

function readCandidates(path) {
  const text = fs.readFileSync(path, "utf8");
  if (path.endsWith(".json")) return JSON.parse(text).map((c) => (typeof c === "string" ? { base: c } : c));
  return text.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean).map((l) => {
    const p = l.split("|").map((s) => s.trim());
    return p.length >= 3 ? { country: p[0], name: p[1], base: p[2] } : { base: p[p.length - 1] };
  });
}

// Origins in the known file: hosts and the myshopify hosts among them.
const known = new Set();
if (opts.known) for (const m of fs.readFileSync(opts.known, "utf8").matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) known.add(m[1].replace(/^www\./, "").toLowerCase());

// Non-Shopify platforms worth naming in the excluded list.
const PLATFORMS = [
  [/cdn11\.bigcommerce|bigcommerce\.com/i, "BigCommerce"], [/woocommerce|wp-content/i, "WooCommerce/WordPress"],
  [/crystalcommerce/i, "Crystal Commerce"], [/tcgsync/i, "TCGSync"], [/static\.wixstatic|wix\.com/i, "Wix"],
  [/squarespace/i, "Squarespace"], [/ecwid/i, "Ecwid"], [/magento|mage\/cookies/i, "Magento"], [/prestashop/i, "PrestaShop"],
  [/shopware/i, "Shopware"], [/__NEXT_DATA__|_next\/static/i, "Next.js custom"], [/cdn\.shopify\.com/i, "Shopify (feeds closed)"],
];

const cands = readCandidates(inFile);
console.log(`detect-shopify: ${cands.length} candidates, ${net.delayMs} ms/host delay, ${net.timeoutMs} ms timeout, UA "${net.ua}"`);

const seenMyshopify = new Map(); // myshopify domain -> first base, to drop duplicates within the batch
const results = await pool(cands, Number(opts.concurrency ?? 8), async (c) => {
  const out = { name: c.name ?? null, input: c.base, inputCountry: c.country ?? null };
  let origin;
  try { origin = new URL(/^https?:\/\//.test(c.base) ? c.base : `https://${c.base}`).origin; } catch { return { ...out, shopify: false, reason: "not a URL" }; }

  const m = await politeGet(origin, "/meta.json");
  if (m.url) { try { origin = new URL(m.url).origin; } catch {} } // follow redirects to the canonical origin
  const meta = json(m.body);
  if (meta?.myshopify_domain) {
    Object.assign(out, { shopify: true, myshopify: meta.myshopify_domain, shopName: meta.name, metaCountry: meta.country, metaCurrency: meta.currency });
  } else {
    // Some themes or apps break meta.json; a products.json array still proves Shopify.
    const p = await politeGet(origin, "/products.json?limit=1");
    const pj = json(p.body);
    if (Array.isArray(pj?.products)) {
      out.shopify = true; out.feedOpen = true;
      try { origin = new URL(p.url).origin; } catch {}
      // The homepage still names the internal domain (Shopify.shop = "x.myshopify.com").
      const home = await politeGet(origin, "/", { accept: "text/html" });
      out.myshopify = home.body?.match(/Shopify\.shop\s*=\s*"([^"]+)"/)?.[1] ?? home.body?.match(/"myshopifyDomain"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    } else {
      out.shopify = false;
      out.status = m.status || p.status;
      const home = await get(origin + "/", { accept: "text/html" });
      out.platform = PLATFORMS.find(([re]) => re.test(home.body ?? ""))?.[1] ?? null;
      out.reason = m.status === -1 ? "robots.txt disallows /meta.json"
        : m.status === 0 && !home.body ? `unreachable (${m.err})`
        : `no Shopify feed (meta.json ${m.status}, products.json ${p.status})${out.platform ? `; looks like ${out.platform}` : `; homepage ${home.status || home.err}`}`;
    }
  }
  out.base = origin;
  out.host = hostOf(origin);
  if (out.shopify && out.feedOpen === undefined) {
    // meta.json answers even on a password-protected store (Troll and Toad on
    // 2026-10-03: meta.json 200, "/" 302 to /password, products.json 401), so
    // prove the product feed is readable before calling the store probe-able.
    const f = await politeGet(origin, "/products.json?limit=1");
    out.feedOpen = Array.isArray(json(f.body)?.products);
    if (!out.feedOpen) out.reason = f.status === -1 ? "robots.txt disallows /products.json" : `Shopify, but products.json answers ${f.status || f.err}${f.status === 401 ? " (password-protected store)" : f.status === 402 ? " (frozen store)" : ""}`;
  }
  if (out.shopify) {
    out.known = known.has(out.host) || (out.myshopify ? known.has(out.myshopify.toLowerCase()) : false);
    const first = out.myshopify && seenMyshopify.get(out.myshopify);
    if (first && first !== origin) out.duplicateOf = first; else if (out.myshopify) seenMyshopify.set(out.myshopify, origin);
    if (cfg) {
      // The physical store (meta.json country) decides the market, not the TLD or the list it came from.
      out.market = marketOf(cfg, out.metaCountry) ?? null;
      if (c.country && out.market && c.country !== out.market) out.marketNote = `input said ${c.country}, meta.json country is ${out.metaCountry}`;
      if (!out.market) out.marketNote = `meta.json country ${out.metaCountry ?? "?"} is in no configured market`;
    }
  }
  const tag = out.shopify ? `SHOPIFY ${out.myshopify ?? "?"} ${out.metaCountry ?? "?"}/${out.metaCurrency ?? "?"}${out.market ? ` -> ${out.market}` : ""}${out.feedOpen ? "" : `  FEED CLOSED: ${out.reason}`}` : `no      ${out.reason}`;
  console.log(`  ${out.host.padEnd(34)} ${tag}${out.known ? "  [already registered]" : ""}${out.duplicateOf ? `  [duplicate of ${out.duplicateOf}]` : ""}${out.marketNote ? `  (${out.marketNote})` : ""}`);
  return out;
});

writeJson(outFile, results);
const sh = results.filter((r) => r.shopify);
const fresh = sh.filter((r) => r.feedOpen && !r.known && !r.duplicateOf && (!cfg || r.market));
console.log(`done: ${results.length} candidates, ${sh.length} Shopify (${sh.filter((r) => !r.feedOpen).length} with a closed feed), ${sh.filter((r) => r.known).length} already registered, ${sh.filter((r) => r.duplicateOf).length} duplicates, ${fresh.length} new to probe -> ${outFile} (${stats.requests} requests, ${stats.blockedByRobots} skipped by robots.txt)`);
