#!/usr/bin/env node
// Stage 3: second pass over the probe's passes. Re-reads the chosen collections
// with the deep classifier (tags, product_type, language options), proves the
// currency a shopper in the store's market is charged, and writes registry-ready
// entries {key, name, base, country, collections, currency?} plus an excluded
// list with one reason per store. Nothing here replaces looking at card images:
// print the `images` URLs from checks and open them (see README).
import fs from "node:fs";
import { parseArgs, usage, loadConfig, setHttp, politeGet, json, pool, readJson, writeJson, classify, stats } from "./lib.mjs";

const opts = parseArgs();
usage(`
Usage: node verify-stores.mjs <probe.json> <out.json> --config game.json [--known stores.ts] [--detect detect.json]
                              [--concurrency 4] [--delay 300] [--timeout 20000] [--ua "..."]
                              [--allow-foreign-currency] [--include-near-miss]
  --known  file whose  key: "..."  entries are taken as registry keys already in use.
  --detect also list detect-stage rejects (not Shopify, already registered, duplicate,
           no market) in "excluded", so one file accounts for every candidate.
  --allow-foreign-currency  keep a store whose proven currency differs from its market,
           writing it as "currency" (the sister importer must then convert or refuse).
`, opts);
if (!opts.config) { console.error("--config is required"); process.exit(2); }
const [inFile, outFile] = opts._;
const cfg = loadConfig(opts.config);
setHttp(opts);

const probed = readJson(inFile);
const usedKeys = new Set(opts.known ? [...fs.readFileSync(opts.known, "utf8").matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]) : []);
const excluded = [];
console.log(`verify-stores: ${probed.length} probed stores from ${inFile}${opts.detect ? ` (+ detect-stage rejects from ${opts.detect})` : ""}`);
const exclude = (s, reason) => { excluded.push({ base: s.base, market: s.market ?? null, reason }); console.log(`  ${(s.market ?? "--")} ${s.host.padEnd(32)} EXCLUDED  ${reason}`); };

if (opts.detect) for (const d of readJson(opts.detect)) {
  const s = { base: d.base ?? d.input, host: d.host ?? String(d.input), market: d.market };
  if (!d.shopify || !d.feedOpen) exclude(s, d.reason ?? "not Shopify");
  else if (d.known) exclude(s, "already in the registry");
  else if (d.duplicateOf) exclude(s, `same Shopify store (${d.myshopify}) as ${d.duplicateOf}`);
  else if (!d.market) exclude(s, d.marketNote ?? "no market");
}

// Stores that never reach verification still get a line in excluded, so the
// output accounts for every probed store.
const toVerify = [];
for (const s of probed) {
  if (s.pass || (opts["include-near-miss"] && s.nearMiss)) toVerify.push(s);
  else if (s.robotsBlocksFeed) exclude(s, "robots.txt disallows the collection products.json feed");
  else if (s.error) exclude(s, `probe error: ${s.error}`);
  else exclude(s, `probe: ${s.uniqueNumbered ?? 0} numbered listings (< ${cfg.minNumbered})`);
}
console.log(`  ${toVerify.length} of ${probed.length} probed stores go to the second pass`);

// The currency a shopper in `iso` really pays, read off a product page served
// under the same ?country= the importer uses (RiftCompare's probe-uk-stores.ts
// method). cart.js would be simpler, but robots.txt often disallows /cart.
async function provenCurrency(base, handle, iso, feedPrice) {
  const r = await politeGet(base, `/products/${handle}?country=${iso}`, { accept: "text/html" });
  const html = r.body ?? "";
  const cur = html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1]
    ?? html.match(/property="og:price:currency"\s+content="([A-Z]{3})"/)?.[1]
    ?? html.match(/Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"/)?.[1] ?? null;
  const prices = [...html.matchAll(/"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/g)].map((m) => Number(m[1]));
  // JSON-LD prices are decimals; some themes print cents. Either agreeing counts.
  const agrees = prices.some((p) => p === Number(feedPrice) || p === Math.round(Number(feedPrice) * 100));
  return { currency: cur, agrees, status: r.status };
}

function makeKey(name, host, market) {
  const slug = (t) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
  let key = slug(name.replace(/&/g, "and").replace(/\b(llc|ltd|inc|pty|gmbh|the)\b/gi, ""));
  if (!key || key.length > 24) key = slug(host.split(".")[0]);
  // On a clash: add the market (e.g. "gamekeeperuk"), then a number.
  let k = usedKeys.has(key) ? key + market.toLowerCase() : key;
  for (let n = 2; usedKeys.has(k); n++) k = key + market.toLowerCase() + n;
  usedKeys.add(k);
  return k;
}

async function verify(s) {
  const market = cfg.markets[s.market];
  // Candidate collections: not skip-listed, with clean listings in the probe.
  const cands = Object.entries(s.perHandle ?? {}).filter(([h, v]) => !v.skipped && v.clean > 0).sort((a, b) => b[1].clean - a[1].clean).slice(0, cfg.maxCollectionsPerStore + 2).map(([h]) => h);
  if (!cands.length) return exclude(s, s.numberedOnlyInSkipped ? "numbered listings only in skip-listed handles (check by hand: singles may live in an oddly named collection)" : "no collection with clean numbered listings");

  const seen = new Map(); const per = {};
  for (const h of cands) {
    const d = json((await politeGet(s.base, `/collections/${encodeURIComponent(h)}/products.json?limit=250&page=1&country=${market.iso}`)).body);
    if (!d?.products) continue;
    const st = per[h] = { products: d.products.length, numbered: 0, clean: 0, foreign: 0, full: d.products.length === 250 };
    for (const p of d.products) {
      const c = classify(p, cfg, true);
      if (!c.numbered) continue;
      st.numbered++; if (c.foreign) st.foreign++;
      if (c.clean) { st.clean++; seen.set(p.id, { ...c, title: p.title, handle: p.handle, price: p.variants?.[0]?.price, image: p.images?.[0]?.src ?? null }); }
      else if (!seen.has(p.id)) seen.set(p.id, { ...c, title: p.title });
    }
  }
  const all = [...seen.values()];
  const clean = all.filter((c) => c.clean);
  // A collection is kept only if it has clean listings and is not mostly foreign.
  const collections = Object.entries(per).filter(([, v]) => v.clean > 0 && v.foreign / v.numbered < cfg.maxForeignShare)
    .sort((a, b) => b[1].clean - a[1].clean).slice(0, cfg.maxCollectionsPerStore).map(([h]) => h);

  // Page 1 per collection only here, so the probe's multi-page count is the better total for big stores.
  const cleanCount = Math.max(clean.length, s.uniqueClean ?? 0);
  const check = {
    market: s.market, myshopify: s.myshopify, metaCountry: s.metaCountry, metaCurrency: s.metaCurrency,
    cleanNumbered: cleanCount, cleanThisPass: clean.length, cleanInTitle: clean.filter((c) => c.inTitle).length,
    available: clean.filter((c) => c.available).length,
    foreignShare: +(all.filter((c) => c.foreign).length / Math.max(1, all.length)).toFixed(2),
    foreignByTag: all.filter((c) => c.foreignTag).length, foreignInBody: all.filter((c) => c.foreignBody).length,
    languageOptions: [...new Set(all.map((c) => c.languageOption).filter(Boolean))].slice(0, 3),
    perCollection: per,
    evidence: clean.filter((c) => c.inTitle).slice(0, 2).map((c) => c.title),
    // Japanese prints sold under English or bare titles were caught ONLY by looking
    // at images on 2026-10-03 (cartespokemon, darumagaming, game-academia).
    images: clean.filter((c) => c.image).filter((_, i) => i % 7 === 0).slice(0, 3).map((c) => c.image),
    flags: [],
  };
  if (check.cleanInTitle < cfg.minNumbered) check.flags.push(`numbers mostly in SKUs (${check.cleanInTitle} in titles): importer must match by name+set`);
  if (check.available < clean.length * 0.1) check.flags.push(`mostly sold out (${check.available}/${clean.length} in stock)`);
  if (check.foreignShare >= 0.2) check.flags.push(`mixed language (${Math.round(check.foreignShare * 100)}% of numbered listings foreign)`);
  if (check.foreignInBody > clean.length / 2) check.flags.push("descriptions mention a foreign edition: open the images");
  if (Object.values(per).some((v) => v.full)) check.flags.push("a collection fills page 1 (250): store is bigger than this sample");

  // Currency: prove it on an in-stock clean listing; fall back to meta.json (weaker).
  const pick = clean.find((c) => c.available && c.handle) ?? clean.find((c) => c.handle);
  const proof = pick ? await provenCurrency(s.base, pick.handle, market.iso, pick.price) : null;
  check.currencyProof = proof ? { ...proof, product: pick.handle } : null;
  const currency = proof?.currency ?? s.metaCurrency ?? null;
  if (!proof?.currency) check.flags.push(`currency not proven on a product page; meta.json says ${s.metaCurrency}`);
  else if (!proof.agrees) check.flags.push("product page price did not match the feed price");

  if (cleanCount < cfg.minNumbered) return exclude(s, `${cleanCount} clean numbered listings (< ${cfg.minNumbered}); foreign ${Math.round(check.foreignShare * 100)}%, graded ${all.filter((c) => c.graded).length}`);
  if (!collections.length) return exclude(s, `every collection is >= ${cfg.maxForeignShare * 100}% foreign (${all.filter((c) => c.foreign).length} of ${all.length} numbered listings; ${check.foreignByTag} by tag${check.languageOptions.length ? `; options ${check.languageOptions.join(", ")}` : ""})`);
  if (currency && currency !== market.currency && !opts["allow-foreign-currency"]) return exclude(s, `${s.market} store charges ${currency}, not ${market.currency}`);

  const name = (s.name || s.shopName || s.host).trim();
  const entry = { key: makeKey(name, s.host, s.market), name, base: s.base.replace(/\/$/, ""), country: s.market, collections };
  if (currency && currency !== market.currency) entry.currency = currency;
  console.log(`  ${s.market} ${s.host.padEnd(32)} KEEP  key=${entry.key} clean=${cleanCount} (this pass ${clean.length}, in titles ${check.cleanInTitle}) cur=${currency}${proof?.currency ? " (proven)" : " (meta)"} cols=${collections.length}${check.flags.length ? `\n      flags: ${check.flags.join("; ")}` : ""}`);
  return { entry, check };
}

const res = (await pool(toVerify, Number(opts.concurrency ?? 4), async (s) => {
  try { return await verify(s); } catch (e) { exclude(s, `verify error: ${e}`); return null; }
})).filter(Boolean);

const entries = res.map((r) => r.entry);
const checks = Object.fromEntries(res.map((r) => [r.entry.key, r.check]));
writeJson(outFile, { game: cfg.game, generatedAt: new Date().toISOString(), entries, checks, excluded });
console.log(`done: ${entries.length} kept, ${excluded.length} excluded -> ${outFile} (${stats.requests} requests, ${stats.blockedByRobots} skipped by robots.txt)`);
if (entries.length) {
  console.log("registry lines (review checks[key].flags and open checks[key].images first):");
  for (const e of entries) console.log("  " + JSON.stringify(e).replace(/"(\w+)":/g, "$1: ").replace(/,(?=\w+: )/g, ", ") + ",");
}
