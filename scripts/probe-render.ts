/**
 * Read-only: render ANY page with a real browser and dump its structure.
 *
 * WHY THIS EXISTS SEPARATELY FROM probe-url:
 * probe-url is a plain fetch. That is the right tool for our OWN pages — the
 * whole point there is to see the bytes a crawler gets. But it is useless for
 * researching a client-rendered site: csroi.com returned a 2.4KB React shell
 * with zero content, and so would any other SPA. probe-imgur already solved
 * this with Playwright, but it is hard-wired to Imgur's album DOM and only
 * emits image URLs.
 *
 * So this is the generic version: point it at a URL, get back the rendered
 * heading outline, the visible text, the table/grid structure and the palette.
 * It is a RESEARCH tool for design/competitor reference — it ships nothing and
 * touches no database.
 *
 * Usage (CI): PROBE_URL=https://example.com npx tsx scripts/probe-render.ts
 *   PROBE_WAIT_MS   extra settle time after networkidle (default 2500)
 *   PROBE_MAX_TEXT  cap on dumped visible text (default 12000 chars)
 */
export {};

// Structure pulled out of the rendered DOM. Kept deliberately small: a CI log is
// the transport, so dumping the whole serialised DOM would be unreadable and
// would blow the log limit on any real page.
interface Rendered {
  title: string;
  headings: { tag: string; text: string }[];
  text: string;
  tables: { headers: string[]; firstRows: string[][]; rowCount: number }[];
  images: { src: string; alt: string; w: number; h: number }[];
  // Repeated-structure detection: the thing that makes a "grid of items" page
  // legible is knowing the item card's shape and how many there are.
  repeatedBlocks: { selector: string; count: number; sample: string }[];
  colors: { color: string; count: number }[];
}

async function main() {
  const url = process.env.PROBE_URL;
  if (!url) {
    console.error("Set PROBE_URL");
    process.exit(1);
  }
  const waitMs = Number(process.env.PROBE_WAIT_MS) || 2500;
  const maxText = Number(process.env.PROBE_MAX_TEXT) || 12000;

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
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1200 },
  });

  console.log(`Rendering ${url}\n`);
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 }).catch((e: Error) => {
    console.error(`goto failed: ${e.message}`);
  });
  // SPAs routinely paint after networkidle (hydration, then a data fetch), so
  // settle deliberately rather than trusting the load event.
  await page.waitForTimeout(waitMs);

  const data: Rendered = await page.evaluate((cap: number) => {
    const txt = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

    const headings = [...document.querySelectorAll("h1,h2,h3,h4")]
      .map((h) => ({ tag: h.tagName.toLowerCase(), text: txt(h) }))
      .filter((h) => h.text)
      .slice(0, 80);

    const tables = [...document.querySelectorAll("table")].slice(0, 6).map((t) => {
      const rows = [...t.querySelectorAll("tr")];
      const headers = [...(rows[0]?.querySelectorAll("th,td") ?? [])].map((c) => txt(c));
      const firstRows = rows.slice(1, 6).map((r) => [...r.querySelectorAll("td,th")].map((c) => txt(c)));
      return { headers, firstRows, rowCount: rows.length };
    });

    const images = [...document.querySelectorAll("img")]
      .slice(0, 40)
      .map((i) => ({
        src: (i as HTMLImageElement).src,
        alt: (i as HTMLImageElement).alt,
        w: (i as HTMLImageElement).naturalWidth,
        h: (i as HTMLImageElement).naturalHeight,
      }));

    // Find the page's repeated item component by looking for the class signature
    // that occurs most often — on a grid-of-items page that IS the item card.
    const byClass = new Map<string, Element[]>();
    for (const el of document.querySelectorAll("div,li,article,a")) {
      const cls = el.getAttribute("class");
      if (!cls) continue;
      const key = cls.trim().slice(0, 120);
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key)!.push(el);
    }
    const repeatedBlocks = [...byClass.entries()]
      .filter(([, els]) => els.length >= 4)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 12)
      .map(([selector, els]) => ({ selector, count: els.length, sample: txt(els[0]).slice(0, 220) }));

    // Palette: what colours actually carry meaning (profit green / loss red etc).
    const colorCount = new Map<string, number>();
    for (const el of [...document.querySelectorAll("*")].slice(0, 4000)) {
      const cs = getComputedStyle(el);
      for (const c of [cs.color, cs.backgroundColor]) {
        if (!c || c === "rgba(0, 0, 0, 0)") continue;
        colorCount.set(c, (colorCount.get(c) ?? 0) + 1);
      }
    }
    const colors = [...colorCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([color, count]) => ({ color, count }));

    return {
      title: document.title,
      headings,
      text: txt(document.body).slice(0, cap),
      tables,
      images,
      repeatedBlocks,
      colors,
    };
  }, maxText);

  console.log(`== TITLE ==\n${data.title}\n`);
  console.log(`== HEADING OUTLINE (${data.headings.length}) ==`);
  for (const h of data.headings) console.log(`  ${h.tag.padEnd(3)} ${h.text}`);

  console.log(`\n== REPEATED BLOCKS (item-component shape) ==`);
  for (const b of data.repeatedBlocks) console.log(`  ×${String(b.count).padStart(4)}  [${b.selector}]\n          "${b.sample}"`);

  console.log(`\n== TABLES (${data.tables.length}) ==`);
  data.tables.forEach((t, i) => {
    console.log(`  table ${i + 1}: ${t.rowCount} rows`);
    console.log(`    headers: ${t.headers.join(" | ")}`);
    for (const r of t.firstRows) console.log(`    row:     ${r.join(" | ")}`);
  });

  console.log(`\n== IMAGES (first ${data.images.length}) ==`);
  for (const i of data.images) console.log(`  ${i.w}x${i.h}  ${i.alt || "(no alt)"}  ${i.src.slice(0, 120)}`);

  console.log(`\n== DOMINANT COLOURS ==`);
  for (const c of data.colors) console.log(`  ${String(c.count).padStart(5)}  ${c.color}`);

  console.log(`\n== VISIBLE TEXT (${data.text.length} chars) ==\n${data.text}`);

  await page.screenshot({ path: "render.png", fullPage: true }).catch(() => {});
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
