/**
 * Read-only: render an Imgur album with a real browser (Imgur serves an empty
 * React shell to plain curl — no image URLs are present in the raw HTML) and
 * dump every full-res image URL + its position/caption in the album, so a CI
 * log has enough to identify and crop individual cards out of multi-card
 * album images.
 *
 * Usage (CI): PROBE_URL=https://imgur.com/a/<id> npx tsx scripts/probe-imgur.ts
 */
export {};

async function main() {
  const url = process.env.PROBE_URL;
  if (!url) {
    console.error("Set PROBE_URL");
    process.exit(1);
  }

  let chromium;
  try {
    // @ts-expect-error — playwright is an OPTIONAL dependency installed in CI just for probe tasks.
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Playwright not installed. Run:\n  npm i --no-save playwright && npx playwright install --with-deps chromium");
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

  console.log(`Loading ${url} …`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 }).catch((e: Error) => console.log("goto warning:", e.message));
  await page.waitForTimeout(2500);

  // Scroll to force any lazy-loaded images in.
  for (let i = 0; i < 15; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(350);
  }

  const title = await page.title().catch(() => "");
  console.log("PAGE TITLE:", title);

  const images: { src: string; alt: string; w: number; h: number }[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img"))
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: (img.alt || "").trim(),
        w: img.naturalWidth,
        h: img.naturalHeight,
      }))
      .filter((x) => /i\.imgur\.com/.test(x.src))
  );
  const uniq = Array.from(new Map(images.map((i) => [i.src.replace(/[a-z]?\.\w+$/i, ""), i])).values());
  console.log(`FOUND ${images.length} imgur <img> tags, ${uniq.length} unique:`);
  for (const im of uniq) console.log(`IMG src=${im.src} alt="${im.alt}" ${im.w}x${im.h}`);

  // Imgur albums embed the full item list (titles, descriptions, hashes) in a
  // Next.js data script — pull it directly for anything the DOM/lazy-load missed.
  const nextData: string = await page.evaluate(() => {
    const el = document.querySelector("#__NEXT_DATA__");
    return el ? (el.textContent ?? "") : "";
  });
  console.log(`__NEXT_DATA__ length: ${nextData.length}`);
  if (nextData) {
    const hashes = Array.from(new Set(Array.from(nextData.matchAll(/"hash":"([a-zA-Z0-9]+)"/g)).map((m) => m[1])));
    console.log(`Hashes found in __NEXT_DATA__: ${hashes.length}`);
    for (const h of hashes) console.log(`HASH ${h} -> https://i.imgur.com/${h}.jpg`);
    const titleMatches = Array.from(nextData.matchAll(/"description":"([^"]{0,200})"/g)).map((m) => m[1]);
    console.log("Descriptions found:", JSON.stringify(titleMatches.slice(0, 60)));
  }

  console.log(`Captured ${jsonBodies.length} JSON responses.`);
  for (const b of jsonBodies) {
    const s = JSON.stringify(b.body);
    console.log(`JSON-URL: ${b.url} size=${s.length}`);
    const hashes = Array.from(new Set(Array.from(s.matchAll(/"hash":"([a-zA-Z0-9]+)"/g)).map((m) => m[1])));
    if (hashes.length) {
      console.log(`  hashes: ${hashes.length}`);
      for (const h of hashes) console.log(`  HASH ${h} -> https://i.imgur.com/${h}.jpg`);
    }
    // The album's OWN data endpoint (api.imgur.com/post/v1/albums/<id>) is small
    // enough to dump in full — print its raw body verbatim rather than relying on
    // a "hash" field regex, since the v1 API's field names differ from the legacy API.
    if (/\/post\/v1\/albums\//.test(b.url)) {
      console.log(`  === FULL ALBUM BODY ===\n${s}\n  === END ALBUM BODY ===`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
