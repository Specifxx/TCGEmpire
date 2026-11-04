// Platform sniff for candidate stores (research only, no repo imports). For each "REGION host Name" line in
// probe/candidates.txt: homepage status + platform signature, robots.txt rules for the feeds, Shopify
// /products.json and /meta.json, WooCommerce Store API, and one JSON-LD Product on a product page if the
// homepage links one. Writes probe/sniff-<shard>.json.
import fs from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SHARD = Number(process.env.SHARD ?? 0), SHARDS = Number(process.env.SHARDS ?? 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, accept = "text/html,application/json;q=0.9,*/*;q=0.8") {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const text = await res.text();
    await sleep(700);
    return { status: res.status, url: res.url, server: res.headers.get("server") ?? "", type: res.headers.get("content-type") ?? "", text };
  } catch (e) { return { status: 0, error: String(e.message ?? e), text: "" }; }
}
function signature(h) {
  const t = h.text.slice(0, 400000); const s = [];
  if (/cdn\.shopify\.com|\/cdn\/shop\/|Shopify\.theme|shopify-section/i.test(t)) s.push("shopify");
  if (/bigcommerce|stencil-utils|cdn11\.bigcommerce|\/stencil\//i.test(t)) s.push("bigcommerce");
  if (/crystalcommerce|crystal-commerce|cc-assets|@crystalcommerce/i.test(t)) s.push("crystalcommerce");
  if (/binderpos|binder-pos/i.test(t)) s.push("binderpos");
  if (/wp-content|woocommerce/i.test(t)) s.push(/woocommerce/i.test(t) ? "woocommerce" : "wordpress");
  if (/Magento|mage\/|requirejs-config|static\/version\d+\/frontend/i.test(t)) s.push("magento");
  if (/prestashop/i.test(t)) s.push("prestashop");
  if (/shopware/i.test(t)) s.push("shopware");
  if (/oxid|out\/[a-z_]+\/src/i.test(t) && /oxid/i.test(t)) s.push("oxid");
  if (/lightspeed|webshopapp|vendimage|shoplightspeed/i.test(t)) s.push("lightspeed");
  if (/squarespace/i.test(t)) s.push("squarespace");
  if (/wix\.com|wixstatic/i.test(t)) s.push("wix");
  if (/ecwid/i.test(t)) s.push("ecwid");
  if (/_next\/static|__NEXT_DATA__/i.test(t)) s.push("nextjs");
  if (/shadowpos|cdn\.shadowpos/i.test(t)) s.push("shadowpos");
  if (/demandware|salesforce/i.test(t)) s.push("sfcc");
  if (/tcgplayer\.com\/pro|pro\.tcgplayer/i.test(t)) s.push("tcgplayer-pro");
  if (/static\.kogan\.com/i.test(t)) s.push("kogan");
  if (/cf-browser-verification|challenge-platform|Just a moment|cf_chl|__cf_chl/i.test(t)) s.push("cloudflare-challenge");
  if (/captcha|Access Denied|Request unsuccessful. Incapsula|_Incapsula_Resource/i.test(t)) s.push("bot-wall");
  return s;
}
async function one(region, host, name) {
  const base = `https://${host}`;
  const row = { region, host, name };
  const home = await get(base);
  row.home = { status: home.status, final: home.url, server: home.server, error: home.error, sig: signature(home) };
  const robots = await get(`${base}/robots.txt`, "text/plain");
  row.robots = { status: robots.status, disallows: (robots.text.match(/^Disallow:\s*(.*)$/gim) ?? []).map((l) => l.replace(/^Disallow:\s*/i, "").trim()).filter((p) => /products\.json|collections|\*|^\/$|\.json|wp-json|product/i.test(p)).slice(0, 20), sitemaps: (robots.text.match(/^Sitemap:\s*(.*)$/gim) ?? []).map((l) => l.replace(/^Sitemap:\s*/i, "").trim()).slice(0, 5) };
  const pj = await get(`${base}/products.json?limit=3`, "application/json");
  let shop = null;
  try { const j = JSON.parse(pj.text); if (Array.isArray(j.products)) shop = { products: j.products.length, sample: j.products.slice(0, 2).map((p) => `${p.title} | ${p.vendor} | ${p.variants?.[0]?.price}`) }; } catch {}
  row.productsJson = { status: pj.status, ok: !!shop, ...shop };
  if (shop || row.home.sig.includes("shopify")) {
    const meta = await get(`${base}/meta.json`, "application/json");
    try { const m = JSON.parse(meta.text); row.meta = { currency: m.currency, name: m.name, country: m.country }; } catch { row.meta = { status: meta.status }; }
  }
  const woo = await get(`${base}/wp-json/wc/store/v1/products?per_page=3`, "application/json");
  try { const j = JSON.parse(woo.text); if (Array.isArray(j)) row.woo = { ok: true, n: j.length, sample: j.slice(0, 2).map((p) => `${p.name} | ${p.prices?.currency_code} ${p.prices?.price}`) }; else row.woo = { ok: false, status: woo.status }; } catch { row.woo = { ok: false, status: woo.status }; }
  // one product page with JSON-LD?
  const link = (home.text.match(/href="([^"]*\/(?:products?|p|item|catalog)\/[^"#?]+)"/i) ?? [])[1];
  if (link) {
    const url = link.startsWith("http") ? link : base + (link.startsWith("/") ? "" : "/") + link;
    const pp = await get(url);
    const ld = [...pp.text.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    const prod = ld.find((x) => /"@type"\s*:\s*"?Product/i.test(x));
    row.productPage = { url, status: pp.status, jsonldProduct: !!prod, price: prod ? (prod.match(/"price"\s*:\s*"?([\d.]+)/) ?? [])[1] : undefined, currency: prod ? (prod.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/) ?? [])[1] : undefined, sig: signature(pp) };
  }
  return row;
}
const lines = fs.readFileSync("probe/candidates.txt", "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim()).filter(Boolean).filter((_, i) => i % SHARDS === SHARD);
const out = [];
for (const line of lines) { const [region, host, ...rest] = line.split(/\s+/); const r = await one(region, host, rest.join(" ")); out.push(r); console.log(JSON.stringify(r)); }
fs.writeFileSync(`probe/sniff-${SHARD}.json`, JSON.stringify(out, null, 1));
