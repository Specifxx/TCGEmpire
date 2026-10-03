#!/usr/bin/env node
// Stage 2: for each Shopify store from detect-shopify.mjs, find the game's
// collections and count what they hold, priced for the store's market
// (?country=<ISO>, the same Shopify Markets parameter the sister site's importer sends).
import { parseArgs, usage, loadConfig, setHttp, politeGet, json, pool, readJson, writeJson, classify, stats } from "./lib.mjs";

const opts = parseArgs();
usage(`
Usage: node probe-collections.mjs <detect.json> <out.json> --config game.json
                                  [--concurrency 4] [--delay 300] [--timeout 20000] [--ua "..."]
                                  [--include-known]
  Probes every Shopify store in <detect.json> with a readable feed and a market, not already
  registered or a duplicate (--include-known probes registered stores too, e.g. to
  seed a new game from the parent site's registry).
`, opts);
if (!opts.config) { console.error("--config is required"); process.exit(2); }
const [inFile, outFile] = opts._;
const cfg = loadConfig(opts.config);
const net = setHttp(opts);

const stores = readJson(inFile).filter((s) => s.shopify && s.feedOpen && s.market && !s.duplicateOf && (opts["include-known"] || !s.known));
console.log(`probe-collections: ${stores.length} stores, game "${cfg.game}", ${net.delayMs} ms/host delay`);

async function discoverHandles(base) {
  const found = new Map(); // handle -> where it came from
  // 1. /collections.json lists every published collection with its title.
  for (let page = 1; page <= 8; page++) {
    const d = json((await politeGet(base, `/collections.json?limit=250&page=${page}`)).body);
    if (!d?.collections?.length) break;
    for (const c of d.collections) if (cfg.handleRe.test(c.handle) || cfg.titleRe.test(c.title ?? "")) found.set(c.handle, "collections.json");
    if (d.collections.length < 250) break;
  }
  // 2. The sitemap index points at sitemap_collections_*.xml (shown even when collections.json is off).
  const idx = (await politeGet(base, "/sitemap.xml", { accept: "application/xml, text/xml" })).body ?? "";
  let maps = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&")).filter((u) => /sitemap_collections/i.test(u));
  if (!maps.length) maps = [`${base}/sitemap_collections_1.xml`];
  for (const sm of maps.slice(0, 6)) {
    let path; try { const u = new URL(sm); path = u.pathname + u.search; } catch { continue; }
    const x = (await politeGet(base, path, { accept: "application/xml, text/xml" })).body ?? "";
    for (const m of x.matchAll(/\/collections\/([^<\/?#"\s]+)/g)) {
      const h = decodeURIComponent(m[1]);
      if (cfg.handleRe.test(h) && !/\.(jpe?g|png|webp|gif)$/i.test(h) && !found.has(h)) found.set(h, "sitemap");
    }
  }
  // 3. Conventional handles, in case both lists hide them. 404s cost one request each.
  for (const h of cfg.conventionalHandles) if (!found.has(h)) found.set(h, "conventional");
  return found;
}

async function probe(s) {
  const iso = cfg.markets[s.market].iso;
  const out = { ...s, iso };
  const handles = await discoverHandles(s.base);
  out.handlesDiscovered = [...handles.values()].filter((v) => v !== "conventional").length;
  // Singles-looking handles first, skip-listed ones last, then cap: big stores have
  // 100+ game collections (ReCollectibles had 125) and most are per-set duplicates.
  const score = (h) => (cfg.singlesHandleRe.test(h) ? 0 : 1) + (cfg.skipHandleRe.test(h) ? 2 : 0);
  const order = [...handles.keys()].sort((a, b) => score(a) - score(b)).slice(0, cfg.maxHandlesPerStore);
  out.handlesProbed = order.length;

  const perHandle = {};
  const byId = new Map(); // product id -> classification, so overlapping collections count once
  for (const h of order) {
    const skipped = cfg.skipHandleRe.test(h);
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const r = await politeGet(s.base, `/collections/${encodeURIComponent(h)}/products.json?limit=250&page=${page}&country=${iso}`);
      if (r.status === -1) { perHandle[h] = { robotsBlocked: true }; out.robotsBlocksFeed = true; break; }
      const d = json(r.body);
      if (!d?.products?.length) { if (page === 1 && r.status !== 404 && r.status !== 200) perHandle[h] = { error: r.status || r.err }; break; }
      const st = perHandle[h] ??= { products: 0, numbered: 0, clean: 0, foreign: 0, graded: 0, notSingle: 0, otherGame: 0, pages: 0, skipped, source: handles.get(h) };
      st.pages = page; st.products += d.products.length;
      for (const p of d.products) {
        const c = classify(p, cfg);
        if (!c.numbered) continue;
        st.numbered++; if (c.clean) st.clean++; if (c.foreign) st.foreign++; if (c.graded) st.graded++; if (c.notSingle) st.notSingle++; if (c.otherGame) st.otherGame++;
        byId.set(p.id, { ...c, title: p.title });
      }
      // Page 1 under-counts big BinderPOS-style stores (Gear Gaming: 18 numbered on
      // page 1, 960 cards on import), so a full page earns more pages while the
      // store is still short of a clear pass.
      if (page === 1 && d.products.length === 250 && !skipped && byId.size < 3 * cfg.minNumbered) pages = 1 + cfg.extraPagesWhenFull;
    }
  }
  const all = [...byId.values()];
  const clean = all.filter((c) => c.clean);
  Object.assign(out, {
    perHandle,
    uniqueNumbered: all.length,
    uniqueClean: clean.length,
    cleanInTitle: clean.filter((c) => c.inTitle).length,
    cleanSkuOnly: clean.filter((c) => !c.inTitle).length,
    foreignNumbered: all.filter((c) => c.foreign).length,
    gradedNumbered: all.filter((c) => c.graded).length,
    // Numbers found only inside skip-listed handles: a store hiding its singles in
    // an oddly named collection (Gate Keepers' "one-piece-sealed") shows up here.
    numberedOnlyInSkipped: Object.values(perHandle).some((v) => v.skipped && v.numbered) && !Object.values(perHandle).some((v) => !v.skipped && v.numbered),
    samples: clean.slice(0, 3).map((c) => c.title),
  });
  // Lenient on purpose: language/graded/currency are judged by verify-stores.mjs.
  out.pass = !out.robotsBlocksFeed && out.uniqueNumbered >= cfg.minNumbered;
  out.nearMiss = !out.pass && out.uniqueNumbered >= 5;
  const cols = Object.entries(perHandle).filter(([, v]) => v.numbered).map(([h, v]) => `${h}(${v.clean}/${v.numbered})`).join(" ");
  console.log(`  ${s.market} ${s.host.padEnd(32)} ${out.pass ? "PASS" : out.nearMiss ? "near" : "fail"} numbered=${out.uniqueNumbered} clean=${out.uniqueClean} (title ${out.cleanInTitle}, sku-only ${out.cleanSkuOnly}) foreign=${out.foreignNumbered} graded=${out.gradedNumbered} handles=${out.handlesProbed}${out.robotsBlocksFeed ? " ROBOTS-BLOCKS-FEED" : ""}${out.numberedOnlyInSkipped ? " ONLY-IN-SKIPPED-HANDLES" : ""}`);
  if (cols) console.log(`      ${cols.slice(0, 220)}`);
  return out;
}

const results = await pool(stores, Number(opts.concurrency ?? 4), async (s) => {
  try { return await probe(s); } catch (e) { console.log(`  ${s.host} ERROR ${e}`); return { ...s, error: String(e), pass: false }; }
});
writeJson(outFile, results);
console.log(`done: ${results.filter((r) => r.pass).length} pass, ${results.filter((r) => r.nearMiss).length} near-miss (5..${cfg.minNumbered - 1} numbered), ${results.filter((r) => !r.pass && !r.nearMiss).length} fail -> ${outFile} (${stats.requests} requests, ${stats.blockedByRobots} skipped by robots.txt)`);
