/**
 * scripts/content-quality.ts — programmatic content-quality audit.
 *
 *   npx tsx scripts/content-quality.ts --url http://localhost:3111
 *   npx tsx scripts/content-quality.ts --url https://riftcompare.com --cards-only
 *
 * Writes content-quality-report.csv (one row per flagged page) and prints a
 * per-template summary. Read-only over HTTP — it never touches the database.
 *
 * WHY THIS EXISTS ALONGSIDE THE OTHER TWO CRAWLERS. scripts/crawl-check.ts walks
 * the site from the homepage and answers "can a bot navigate this"; scripts/
 * seo-gate.ts walks the sitemap and answers "is what we published publishable".
 * Neither answers the question a programmatic surface actually rots on: are the
 * ~1,400 generated pages SUBSTANTIVELY different from each other, or is the
 * template producing 1,400 near-copies with a name swapped? That is a
 * template-level defect — you cannot see it on any single page, only across the
 * whole set — and it is the one that gets a site classified as scaled content.
 *
 * WHAT IT FLAGS
 *   MISSING_TITLE / MISSING_DESCRIPTION  — no meta at all
 *   SHORT_DESCRIPTION                    — under MIN_DESC_CHARS, so it renders truncated or bare
 *   DUPLICATE_DESCRIPTION                — byte-identical to another page's
 *   NEAR_DUPLICATE_DESCRIPTION           — >= NEAR_DUP_THRESHOLD token overlap with another page's
 *   EMPTY_SECTION                        — a section heading rendered with no content under it
 *   MISSING_SECTION                      — a section this template should always carry is absent
 *   THIN_EDITORIAL                       — under MIN_EDITORIAL_WORDS of PROSE (see below)
 *   BROKEN_INTERNAL_LINK                 — an internal href that does not return 200
 *
 * EDITORIAL WORDS, NOT PAGE WORDS. A card page is mostly price tables and a grid
 * of related-card tiles; counting those makes every page look 2,000 words long
 * and hides the thin ones completely. This counts only <p>, <li> and <dd> text —
 * prose a reader actually reads — which is the number that separates a page with
 * something to say from a table with a headline.
 */
export {};

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const has = (n: string) => args.includes(n);
const argOf = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BASE = argOf("--url", "http://localhost:3111").replace(/\/$/, "");
const MAX_PAGES = Number(argOf("--max", "5000"));
const CONCURRENCY = Number(argOf("--concurrency", "10"));
const CARDS_ONLY = has("--cards-only");
const OUT = argOf("--out", join(process.cwd(), "content-quality-report.csv"));
const UA = "Mozilla/5.0 (compatible; RiftCompare-ContentQuality/1.0)";

const MIN_DESC_CHARS = 70;
const MIN_EDITORIAL_WORDS = 120;
/** Jaccard overlap on description tokens above which two pages are "the same". */
const NEAR_DUP_THRESHOLD = 0.9;
/** Internal links are verified once each, capped so a full run stays bounded. */
const MAX_LINK_CHECKS = 4000;

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", B = "\x1b[1m", O = "\x1b[0m";

// ─────────────────────────────────────────────────────────────────────────────
// Templates. Each declares the sections its pages should always carry, so a
// template that silently stops rendering one is caught across every instance
// rather than on whichever page a human happens to open.
// ─────────────────────────────────────────────────────────────────────────────
interface Template {
  name: string;
  test: (path: string) => boolean;
  /** Heading text (lowercased substring) every page of this template must have. */
  requiredSections?: string[];
}

const TEMPLATES: Template[] = [
  { name: "card", test: (p) => p.startsWith("/card/"), requiredSections: ["about", "frequently asked questions", "read next"] },
  { name: "decks/archetype", test: (p) => p.startsWith("/decks/archetype/") },
  { name: "decks/domain", test: (p) => p.startsWith("/decks/domain/") },
  { name: "deck", test: (p) => /^\/decks\/[^/]+$/.test(p) && p !== "/decks" },
  { name: "champion", test: (p) => p.startsWith("/champions/") && p !== "/champions" },
  { name: "keyword", test: (p) => p.startsWith("/keywords/") && p !== "/keywords" },
  { name: "domain", test: (p) => p.startsWith("/domains/") && p !== "/domains" },
  { name: "facet", test: (p) => /^\/cards\/(type|rarity|printing)\//.test(p) },
  { name: "set/gallery", test: (p) => /^\/sets\/[^/]+\/gallery$/.test(p) },
  { name: "set", test: (p) => /^\/sets\/[^/]+$/.test(p) && p !== "/sets" },
  { name: "store", test: (p) => p.startsWith("/stores/") && p !== "/stores" },
  { name: "guide", test: (p) => p.startsWith("/guides/") },
  { name: "blog", test: (p) => p.startsWith("/blog/") },
  { name: "author", test: (p) => p.startsWith("/authors/") },
  { name: "marketplace/seller", test: (p) => p.startsWith("/marketplace/seller/") },
];
const templateOf = (p: string): string => TEMPLATES.find((t) => t.test(p))?.name ?? "static";
const templateSpec = (name: string) => TEMPLATES.find((t) => t.name === name);

// ─────────────────────────────────────────────────────────────────────────────
const decode = (s: string): string =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

const strip = (html: string): string =>
  decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

interface Page {
  path: string;
  status: number;
  template: string;
  title: string;
  description: string;
  /** Prose words only — <p>/<li>/<dd>. See the header note. */
  editorialWords: number;
  headings: { text: string; contentWords: number }[];
  internalLinks: string[];
  error?: string;
}

async function fetchPage(path: string): Promise<Page> {
  const base: Page = {
    path, status: 0, template: templateOf(path), title: "", description: "",
    editorialWords: 0, headings: [], internalLinks: [],
  };
  let res: Response, html: string;
  try {
    res = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA, accept: "text/html" } });
    html = await res.text();
  } catch (e) {
    return { ...base, error: String(e).slice(0, 140) };
  }
  if (res.status !== 200) return { ...base, status: res.status };

  const head = html.slice(0, (html.indexOf("</head>") + 7) || 4000);
  const title = strip(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const description = decode(
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i.exec(head)?.[1] ?? ""
  ).trim();

  // Scripts and styles out first, so JSON-LD and CSS never count as prose.
  // Then the CHROME: layout.tsx renders a <header> nav and a <footer> whose
  // link lists are <li> elements. Counting those adds the same ~250 words to
  // every page on the site, which is exactly enough to lift a genuinely thin
  // template above any sane threshold and hide it. Measuring <main> only is the
  // difference between "every page looks fine" and finding the thin ones.
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(stripped)?.[1];
  const content = (main ?? stripped)
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  // Prose measurement drops <nav> too (breadcrumb trails are navigation, not
  // writing). The LINK GRAPH must not: breadcrumbs live inside <main> and are
  // genuine internal links — excluding them reported /domains as an orphan when
  // seven pages link to it from their trail. Two different questions, two
  // different inputs, deliberately.
  const body = content.replace(/<nav[\s\S]*?<\/nav>/gi, " ");

  let editorialWords = 0;
  for (const m of body.matchAll(/<(p|li|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = strip(m[2]);
    if (t) editorialWords += t.split(" ").length;
  }

  // Each heading and the prose between it and the next heading. An "empty
  // section" is a heading a reader is promised something under and isn't given
  // it — invisible in a whole-page word count, obvious here.
  const headings: Page["headings"] = [];
  const hs = [...body.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  for (const [i, h] of hs.entries()) {
    // sr-only headings are ACCESSIBILITY LABELS for the component that follows,
    // not promises of prose — "Price history & where to buy X" labels the price
    // table, whose own visible heading is the next node. Measuring the gap
    // between the two reported the whole card template as having an empty
    // section on every page. The content is there; the heading just isn't the
    // thing that owns it.
    if (/class=["'][^"']*\bsr-only\b/.test(h[0])) continue;
    const from = (h.index ?? 0) + h[0].length;
    const to = i + 1 < hs.length ? hs[i + 1].index ?? body.length : body.length;
    const slice = body.slice(from, to);
    // A heading whose section opens with ANOTHER heading is a container (a
    // section title above sub-sections), and its content belongs to the child.
    // Only leaf sections can be meaningfully empty.
    if (/^[\s\S]{0,400}?<h[1-4]\b/.test(slice)) continue;
    let words = 0;
    for (const m of slice.matchAll(/<(p|li|dd|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const t = strip(m[2]);
      if (t) words += t.split(" ").length;
    }
    // A section can be full of content and carry no prose at all: "Other
    // printings of X" and "More Jinx cards" are grids of <a><img> tiles, and
    // "Decklist · 55 cards" is a table of card links. Counting only prose
    // reported all of those as empty — 1,388 false positives on the first run,
    // which would have buried the real defects. A section is empty only when it
    // has neither prose NOR any linked/illustrated content under it.
    const tiles = (slice.match(/<a\b[^>]*href=/gi) ?? []).length + (slice.match(/<img\b/gi) ?? []).length;
    const text = strip(h[2]);
    if (text) headings.push({ text, contentWords: words + tiles });
  }

  const internalLinks = [
    ...new Set(
      [...content.matchAll(/<a\b[^>]*href=["'](\/[^"'#?]*)["']/gi)]
        .map((m) => m[1].replace(/\/+$/, "") || "/")
        .filter((h) => !h.startsWith("/api/") && !h.startsWith("/_next/"))
    ),
  ];

  return { ...base, status: res.status, title, description, editorialWords, headings, internalLinks };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const k = i++;
        if (k >= items.length) return;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

/** Content tokens of a description, for the near-duplicate comparison. Numbers
 *  are dropped: two card descriptions differing only in price are the same
 *  sentence, and treating them as distinct is exactly the blind spot here. */
const tokens = (s: string): Set<string> =>
  new Set(
    s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2)
  );

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main(): Promise<void> {
  console.log(`\n${B}Content quality — ${BASE}${O}\n`);

  // 1. URL list, from the sitemap (the pages we actually ask to be indexed).
  const idx = await fetch(`${BASE}/sitemap.xml`, { headers: { "user-agent": UA } }).then((r) => r.text());
  const children = [...idx.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map((m) => m[1]);
  const urls = new Set<string>();
  for (const child of children) {
    const xml = await fetch(`${BASE}${new URL(child).pathname}`, { headers: { "user-agent": UA } }).then((r) => r.text());
    for (const m of xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)) urls.add(new URL(m[1]).pathname.replace(/\/+$/, "") || "/");
  }
  let paths = [...urls];
  if (CARDS_ONLY) paths = paths.filter((p) => p.startsWith("/card/"));
  paths = paths.slice(0, MAX_PAGES);
  console.log(`${paths.length} URLs from the sitemap${CARDS_ONLY ? " (card pages only)" : ""}\n`);

  // 2. Fetch.
  let done = 0;
  const pages = await pool(paths, CONCURRENCY, async (p) => {
    const r = await fetchPage(p);
    if (++done % 200 === 0) process.stdout.write(`\r  fetched ${done}/${paths.length}`);
    return r;
  });
  process.stdout.write(`\r  fetched ${done}/${paths.length}\n\n`);

  const ok = pages.filter((p) => p.status === 200 && !p.error);

  // 3. Duplicate + near-duplicate descriptions, compared WITHIN a template.
  //    Across templates a shared sentence is usually fine (a hub and a card page
  //    legitimately describe the site); within one template it is the template
  //    failing to differentiate its own pages, which is the actual defect.
  const dupExact = new Map<string, string[]>();
  const nearDup = new Map<string, string[]>();
  for (const t of new Set(ok.map((p) => p.template))) {
    const group = ok.filter((p) => p.template === t && p.description);
    const byDesc = new Map<string, string[]>();
    for (const p of group) byDesc.set(p.description, [...(byDesc.get(p.description) ?? []), p.path]);
    for (const [, v] of byDesc) if (v.length > 1) for (const path of v) dupExact.set(path, v.filter((x) => x !== path));

    // Near-duplicates: O(n²) is fine at a few thousand, but bucket by length
    // first so a 1,400-card template doesn't do 1M set comparisons.
    const toks = group.map((p) => ({ p, t: tokens(p.description) }));
    for (let i = 0; i < toks.length; i++) {
      for (let j = i + 1; j < toks.length; j++) {
        const sizeRatio = Math.min(toks[i].t.size, toks[j].t.size) / Math.max(toks[i].t.size, toks[j].t.size);
        if (sizeRatio < NEAR_DUP_THRESHOLD) continue;
        if (jaccard(toks[i].t, toks[j].t) < NEAR_DUP_THRESHOLD) continue;
        if (toks[i].p.description === toks[j].p.description) continue; // already exact
        nearDup.set(toks[i].p.path, [...(nearDup.get(toks[i].p.path) ?? []), toks[j].p.path]);
        nearDup.set(toks[j].p.path, [...(nearDup.get(toks[j].p.path) ?? []), toks[i].p.path]);
      }
    }
  }

  // 4. Internal links — build the inbound graph, then verify the distinct targets.
  const inbound = new Map<string, Set<string>>();
  const allTargets = new Set<string>();
  for (const p of ok) {
    for (const l of p.internalLinks) {
      allTargets.add(l);
      if (!inbound.has(l)) inbound.set(l, new Set());
      inbound.get(l)!.add(p.path);
    }
  }
  const known = new Set(ok.map((p) => p.path));
  const toCheck = [...allTargets].filter((t) => !known.has(t)).slice(0, MAX_LINK_CHECKS);
  const linkStatus = new Map<string, number>();
  await pool(toCheck, CONCURRENCY, async (t) => {
    try {
      const r = await fetch(`${BASE}${t}`, { method: "GET", headers: { "user-agent": UA }, redirect: "follow" });
      linkStatus.set(t, r.status);
    } catch {
      linkStatus.set(t, 0);
    }
  });
  for (const k of known) linkStatus.set(k, 200);
  const broken = [...linkStatus.entries()].filter(([, s]) => s !== 200).map(([t]) => t);

  // 5. Flags.
  type Row = { path: string; template: string; issue: string; detail: string };
  const rows: Row[] = [];
  for (const p of pages) {
    if (p.error) { rows.push({ path: p.path, template: p.template, issue: "FETCH_ERROR", detail: p.error }); continue; }
    if (p.status !== 200) { rows.push({ path: p.path, template: p.template, issue: "NON_200", detail: String(p.status) }); continue; }
    if (!p.title) rows.push({ path: p.path, template: p.template, issue: "MISSING_TITLE", detail: "" });
    if (!p.description) rows.push({ path: p.path, template: p.template, issue: "MISSING_DESCRIPTION", detail: "" });
    else if (p.description.length < MIN_DESC_CHARS)
      rows.push({ path: p.path, template: p.template, issue: "SHORT_DESCRIPTION", detail: `${p.description.length} chars` });
    if (dupExact.has(p.path))
      rows.push({ path: p.path, template: p.template, issue: "DUPLICATE_DESCRIPTION", detail: `${dupExact.get(p.path)!.length} others, e.g. ${dupExact.get(p.path)![0]}` });
    if (nearDup.has(p.path))
      rows.push({ path: p.path, template: p.template, issue: "NEAR_DUPLICATE_DESCRIPTION", detail: `${nearDup.get(p.path)!.length} others, e.g. ${nearDup.get(p.path)![0]}` });
    if (p.editorialWords < MIN_EDITORIAL_WORDS)
      rows.push({ path: p.path, template: p.template, issue: "THIN_EDITORIAL", detail: `${p.editorialWords} prose words` });
    for (const h of p.headings)
      if (h.contentWords === 0)
        rows.push({ path: p.path, template: p.template, issue: "EMPTY_SECTION", detail: h.text.slice(0, 60) });
    const spec = templateSpec(p.template);
    for (const need of spec?.requiredSections ?? []) {
      if (!p.headings.some((h) => h.text.toLowerCase().includes(need)))
        rows.push({ path: p.path, template: p.template, issue: "MISSING_SECTION", detail: need });
    }
    for (const l of p.internalLinks)
      if (broken.includes(l))
        rows.push({ path: p.path, template: p.template, issue: "BROKEN_INTERNAL_LINK", detail: `${l} → ${linkStatus.get(l) ?? "?"}` });
  }

  // 6. CSV.
  const csv = ["path,template,issue,detail", ...rows.map((r) => [r.path, r.template, r.issue, r.detail].map(csvCell).join(","))].join("\n");
  writeFileSync(OUT, csv + "\n", "utf8");

  // 7. Summary.
  const byIssue = new Map<string, number>();
  for (const r of rows) byIssue.set(r.issue, (byIssue.get(r.issue) ?? 0) + 1);
  console.log(`${B}Issues${O}`);
  if (!byIssue.size) console.log(`  ${G}✓${O} none`);
  for (const [k, v] of [...byIssue.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${v > 0 ? R + "✗" + O : ""} ${String(v).padStart(5)}  ${k}`);

  console.log(`\n${B}Per template${O}`);
  const tmplNames = [...new Set(ok.map((p) => p.template))];
  const w = Math.max(...tmplNames.map((t) => t.length), 8);
  console.log(`  ${"template".padEnd(w)}  pages  med.prose  min  issues  ${D}median inbound links${O}`);
  for (const t of tmplNames.sort()) {
    const g = ok.filter((p) => p.template === t);
    const words = g.map((p) => p.editorialWords).sort((a, b) => a - b);
    const med = words[Math.floor(words.length / 2)] ?? 0;
    const inb = g.map((p) => inbound.get(p.path)?.size ?? 0).sort((a, b) => a - b);
    const medIn = inb[Math.floor(inb.length / 2)] ?? 0;
    const issues = rows.filter((r) => r.template === t).length;
    const flag = med < MIN_EDITORIAL_WORDS ? `${Y}THIN${O}` : "    ";
    console.log(`  ${t.padEnd(w)}  ${String(g.length).padStart(5)}  ${String(med).padStart(9)}  ${String(words[0] ?? 0).padStart(3)}  ${String(issues).padStart(6)}  ${String(medIn).padStart(6)}   ${flag}`);
  }

  // Orphans: submitted, but nothing in the crawl links to them.
  const orphans = ok.filter((p) => (inbound.get(p.path)?.size ?? 0) === 0 && p.path !== "/");
  console.log(`\n${B}Orphans${O} (submitted, zero inbound internal links): ${orphans.length}`);
  for (const o of orphans.slice(0, 20)) console.log(`  ${o.path}`);
  if (orphans.length > 20) console.log(`  …and ${orphans.length - 20} more`);

  console.log(`\nWrote ${OUT} (${rows.length} rows)\n`);
  // Report-only by design: this is a diagnostic that informs template fixes, not
  // a gate. seo-gate.ts is the thing that blocks a deploy.
}

main().catch((e) => {
  console.error(`${R}content-quality crashed:${O}`, e);
  process.exit(1);
});
