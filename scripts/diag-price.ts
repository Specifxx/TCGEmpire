/**
 * Diagnostic: fetch Mint's Time Warp price via several strategies to see which one
 * returns the live price ($45) vs the stale cached value ($33) FROM the GitHub
 * runner's network. Run via the "Price diagnostic" workflow and read the logs.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BOT_UA = "Mozilla/5.0 RiftCompareAUBot";
const PRODUCT = "https://mintcollectables.com.au/products/2025-riftbound-origins-122-298-time-warp-epic";

async function tryFetch(label: string, url: string, headers: Record<string, string>, kind: "json" | "js" | "html") {
  try {
    const res = await fetch(url, { headers, cache: "no-store" as RequestCache });
    const status = res.status;
    const age = res.headers.get("age");
    const xcache = res.headers.get("x-cache") || res.headers.get("cf-cache-status") || res.headers.get("x-served-by") || "";
    const body = await res.text();
    let price = "?";
    if (kind === "json") {
      try { price = JSON.parse(body).product?.variants?.[0]?.price ?? "?"; } catch {}
    } else if (kind === "js") {
      try { price = String((JSON.parse(body).price ?? "?")); } catch {}
    } else {
      // HTML: try JSON-LD offers price, then og/product price meta, then first "price":"NN.NN"
      const ld = body.match(/"price"\s*:\s*"?([0-9]+\.[0-9]{2})"?/);
      const meta = body.match(/property="(?:og:price:amount|product:price:amount)"\s+content="([0-9.]+)"/i);
      price = (meta && meta[1]) || (ld && ld[1]) || "?";
    }
    console.log(`${label.padEnd(34)} status=${status} age=${age ?? "-"} cache=${xcache.slice(0,18).padEnd(18)} price=$${price}`);
  } catch (e) {
    console.log(`${label.padEnd(34)} ERROR ${(e as Error).message}`);
  }
}

async function main() {
  const bust = () => `?_=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await tryFetch("product.json clean BROWSER", `${PRODUCT}.json`, { "User-Agent": BROWSER_UA }, "json");
  await tryFetch("product.json clean BOT", `${PRODUCT}.json`, { "User-Agent": BOT_UA }, "json");
  await tryFetch("product.json bust BROWSER", `${PRODUCT}.json${bust()}`, { "User-Agent": BROWSER_UA }, "json");
  await tryFetch("product.json no-cache hdr", `${PRODUCT}.json`, { "User-Agent": BROWSER_UA, "Cache-Control": "no-cache", Pragma: "no-cache" }, "json");
  await tryFetch("product.js BROWSER", `${PRODUCT}.js`, { "User-Agent": BROWSER_UA }, "js");
  await tryFetch("product.js bust BROWSER", `${PRODUCT}.js${bust()}`, { "User-Agent": BROWSER_UA }, "js");
  await tryFetch("HTML page BROWSER", PRODUCT, { "User-Agent": BROWSER_UA }, "html");
  await tryFetch("HTML page bust BROWSER", `${PRODUCT}${bust()}`, { "User-Agent": BROWSER_UA }, "html");
  console.log("\n(live price should be $45.00; stale is $33.00)");
}
main();
