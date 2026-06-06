/**
 * Diagnostic: Shopify serves Mint's Time Warp at $33 to the US CI runner but $45 to
 * AU visitors (Shopify Markets geo-pricing). Find which AU-override makes the runner
 * get the $45 AU price.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PRODUCT = "https://mintcollectables.com.au/products/2025-riftbound-origins-122-298-time-warp-epic";

async function tryFetch(label: string, url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { headers, cache: "no-store" as RequestCache });
    const body = await res.text();
    let price = "?";
    try { price = JSON.parse(body).product?.variants?.[0]?.price ?? "?"; } catch {
      const m = body.match(/"price"\s*:\s*"?([0-9]+\.[0-9]{2})"?/); price = m ? m[1] : "?";
    }
    console.log(`${label.padEnd(40)} status=${res.status} price=$${price}`);
  } catch (e) {
    console.log(`${label.padEnd(40)} ERROR ${(e as Error).message}`);
  }
}

async function main() {
  const AU = { "User-Agent": UA, "Accept-Language": "en-AU,en;q=0.9" };
  await tryFetch("baseline .json", `${PRODUCT}.json`, { "User-Agent": UA });
  await tryFetch(".json ?country=AU", `${PRODUCT}.json?country=AU`, { "User-Agent": UA });
  await tryFetch(".json ?country=AU&currency=AUD", `${PRODUCT}.json?country=AU&currency=AUD`, { "User-Agent": UA });
  await tryFetch(".json Accept-Language en-AU", `${PRODUCT}.json`, AU);
  await tryFetch(".json ?country=AU + en-AU hdr", `${PRODUCT}.json?country=AU`, AU);
  await tryFetch(".json cookie localization=AU", `${PRODUCT}.json`, { "User-Agent": UA, Cookie: "localization=AU; cart_currency=AUD" });
  await tryFetch(".json cookie + ?country=AU", `${PRODUCT}.json?country=AU`, { "User-Agent": UA, Cookie: "localization=AU; cart_currency=AUD" });
  await tryFetch("HTML ?country=AU", `${PRODUCT}?country=AU`, AU);
  await tryFetch(".json ?_country=AU (alt)", `${PRODUCT}.json?_country=AU`, { "User-Agent": UA });
  console.log("\n(want $45.00 = AU price; $33.00 = US/default price)");
}
main();
