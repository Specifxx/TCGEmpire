/**
 * scripts/adsense-audit.ts — measure the content surface before changing it.
 *
 *   npx tsx scripts/adsense-audit.ts --url http://localhost:3111
 *   npx tsx scripts/adsense-audit.ts --url https://riftcompare.com --sample 40
 *
 * Writes docs/adsense-audit.json (machine-readable, consumed by
 * scripts/adsense-guard.ts) and prints a readable summary.
 *
 * ── The metric that matters: UNIQUE EDITORIAL WORDS ──────────────────────────
 * A raw word count on a templated page is meaningless — nav, footer, breadcrumbs,
 * badges, the price table and the affiliate disclosure are identical on 1,400
 * pages and Google discounts every one of them. What a reviewer is actually
 * judging is the text that exists ONLY on this URL. So:
 *
 *   1. Take only <main id="main-content">. Everything outside it is site chrome
 *      by construction (the root layout puts page content there and nothing else).
 *   2. Drop <script>, <style>, <svg>, <nav>, and every <table> — price tables are
 *      data, not editorial, and they'd otherwise inflate exactly the pages this
 *      is meant to catch.
 *   3. Strip tags, decode entities, split into sentences.
 *   4. Subtract BOILERPLATE, defined empirically rather than by a hand-written
 *      list: any sentence appearing on more than BOILERPLATE_THRESHOLD of the
 *      sampled pages sitewide. That catches the disclosures, the "prices update
 *      daily" lines and every templated sentence stem, including ones nobody
 *      remembered to exclude.
 *
 * What's left is the page's own words. Under 150 of them is THIN.
 *
 * ── Near-duplicate detection ─────────────────────────────────────────────────
 * 8-word shingles over the editorial text, Jaccard similarity, all-pairs within
 * each template group. A cluster is flagged when >80% of a group's sampled pages
 * are >90% similar to one another — the shape of Google's "scaled content abuse"
 * policy, and the specific charge a 1,400-page templated catalogue invites.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const argOf = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = argOf("--url", "http://localhost:3111").replace(/\/$/, "");
const SAMPLE = Number(argOf("--sample", "30"));
const CONCURRENCY = Number(argOf("--concurrency", "8"));
const OUT = join(process.cwd(), "docs", "adsense-audit.json");

const THIN_WORDS = 150;
const BOILERPLATE_THRESHOLD = 0.35; // a sentence on >35% of sampled pages is chrome
const SHINGLE = 8;
const DUP_SIMILARITY = 0.9;
const DUP_CLUSTER_SHARE = 0.8;

// ── template classification ──────────────────────────────────────────────────
// Ordered: first match wins.
const TEMPLATES: [string, RegExp][] = [
  ["card", /^\/card\//],
  ["set", /^\/sets\//],
  ["domain", /^\/domains\//],
  ["keyword", /^\/keywords\//],
  ["champion", /^\/champions\//],
  ["facet", /^\/cards\//],
  ["deck", /^\/decks?\//],
  ["store", /^\/stores\//],
  ["marketplace-listing", /^\/marketplace\/listing/],
  ["marketplace", /^\/marketplace/],
  ["blog", /^\/blog\//],
  ["guide", /^\/guides\//],
  ["tool", /^\/(tools|market|movers|bulk-pricer|trade|deck|sealed|singles|riftle|games|portfolio|widgets|embed)/],
  ["index", /^\/(browse|cards|sets|domains|keywords|champions|decks|stores|blog|guides|learn)\/?$/],
  ["static", /.*/],
];
const templateOf = (path: string) => TEMPLATES.find(([, re]) => re.test(path))![0];

// ── HTML → editorial text ────────────────────────────────────────────────────
const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&ldquo;": "“", "&rdquo;": "”",
  "&lsquo;": "‘", "&rsquo;": "’", "&hellip;": "…", "&times;": "×",
};

function mainContent(html: string): string {
  // NOT <main> — on streaming routes React defers content into hidden divs at
  // the end of <body> and swaps it in from an inline script, so <main> holds
  // only the Suspense fallback. Reading <main> scored the homepage at 0 words.
  // Take the whole body and subtract the chrome landmarks explicitly instead;
  // whatever repeated text survives that is caught by the boilerplate pass.
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return m ? m[1] : html;
}

function toText(fragment: string): string {
  // Strip the SITE header only — the one that precedes <main>. A page-level
  // <header> INSIDE main holds the page's own h1 and intro copy, and stripping
  // it scored /trade's 190-word editorial intro as zero.
  const mainAt = fragment.search(/<main[^>]*id="main-content"/i);
  const chrome = mainAt > 0 ? fragment.slice(0, mainAt) : "";
  const rest = mainAt > 0 ? fragment.slice(mainAt) : fragment;
  return (chrome.replace(/<header[\s\S]*?<\/header>/gi, " ") + rest)
    .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    // Price tables are data, not prose — counting them is how a bare price table
    // scores as "600 words" and hides from a thin-content check.
    .replace(/<table[\s\S]*?<\/table>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\s*·\s*|\s*\|\s*/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4);

const wordsOf = (text: string) => text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));

function shingles(words: string[]): Set<string> {
  const out = new Set<string>();
  const norm = words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (let i = 0; i + SHINGLE <= norm.length; i++) out.add(norm.slice(i, i + SHINGLE).join(" "));
  return out;
}

// TEMPLATE similarity — the measure that actually matches what a reviewer sees.
//
// Raw shingles massively understate templating: "Jinx is a rare unit card from
// Origins (OGN)" and "Vayne is a common unit card from Origins (OGN)" share
// almost no 8-word shingle, yet they are the SAME page with two nouns swapped.
// Masking the per-page variables — proper nouns, numbers, money, set codes —
// collapses both to one string and exposes the real overlap.
//
// This is the number to judge "scaled content abuse" on. The raw score is kept
// alongside it because it is what the brief specified.
function templateWords(text: string): string[] {
  return wordsOf(
    text
      .replace(/[£$€]\s?\d[\d,.]*/g, " ¤ ")
      .replace(/\b\d[\d,.]*%?\b/g, " # ")
      .replace(/\b[A-Z]{2,4}\b/g, " ¶ ") // set codes: OGN, VEN, SFD…
      // A capitalised word not at the start of a sentence is almost always a
      // card, set, champion, store or domain name on this site.
      .replace(/(?<![.!?]\s)(?<!^)\b[A-Z][a-z']+\b/g, " § "),
  ).map((w) => w.toLowerCase());
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return a.size === b.size ? 1 : 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const s of small) if (large.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

// ── page facts ───────────────────────────────────────────────────────────────
type Page = {
  path: string;
  template: string;
  status: number;
  title: string;
  description: string;
  h1Count: number;
  canonical: string | null;
  noindex: boolean;
  hasBreadcrumbs: boolean;
  affiliateLinks: number;
  unsponsoredOutbound: string[];
  paywalled: boolean;
  authWall: boolean;
  softFourOhFour: boolean;
  /** <main> contains only a client-side-rendering bailout: NO content in the HTML. */
  emptyServerRender: boolean;
  rawText: string;
  sentences: string[];
  editorialWords: number;
  internalLinks: string[];
};

const PAYWALL_MARKERS = [
  /Unlock\s+\d+\s+more/i,
  /blur-\[\d+px\]/,
  /Sign in to view/i,
  /Unlock the full/i,
  /Subscribe to see/i,
];
const AUTH_MARKERS = [/Sign in to continue/i, /You must be signed in/i, /Please log in to/i];
const SOFT_404_MARKERS = [
  /We couldn['’]t find/i,
  /No results found/i,
  /Nothing here yet/i,
  /Something went wrong/i,
  /couldn['’]t load/i,
];

async function fetchPage(path: string): Promise<Page | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      redirect: "follow",
      headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; RiftCompare-Audit/1.0)" },
    });
  } catch {
    return null;
  }
  const html = await res.text();

  // A page whose <main> holds only React's client-side-rendering bailout marker
  // ships NO content to anything that doesn't execute JavaScript. This is not a
  // subtle SEO nicety: the homepage was in exactly this state, serving a
  // "Loading…" spinner, no <h1> and not one internal link, to every raw fetch —
  // including an AdSense reviewer's. In the App Router it is caused by an
  // unwrapped useSearchParams() deopting its subtree up to the nearest Suspense
  // boundary (here, app/loading.tsx). Checked on the ELEMENT, not the document:
  // the marker legitimately appears elsewhere on every page, inside the navbar
  // search's own Suspense boundaries, where it costs a search input and nothing else.
  const mainEl = /<main[^>]*id="main-content"[^>]*>([\s\S]{0,400})/.exec(html);
  const emptyServerRender = Boolean(mainEl && mainEl[1].includes("BAILOUT_TO_CLIENT_SIDE_RENDERING"));

  const main = mainContent(html);
  const text = toText(main);
  const sentences = sentencesOf(text);

  const outbound = [...html.matchAll(/<a\b([^>]*?)href="(https?:\/\/[^"]+)"([^>]*)>/gi)];
  const external = outbound.filter(([, , href]) => !href.includes("riftcompare.com"));
  const unsponsored = external
    .filter(([, pre, , post]) => !/rel="[^"]*sponsored/i.test(pre + post))
    .map(([, , href]) => href.split("?")[0])
    // Only genuinely COMMERCIAL destinations. An editorial citation to another
    // site (riftbound.gg, a Riot page) must NOT carry rel="sponsored" — that
    // would misdeclare a normal reference as a paid placement.
    .filter((h) => /(^|\.)(ebay|tcgplayer|amazon|cardmarket|tcgrepublic)\.|shopify|myshopify|collectables|cardmerchant/i.test(h));

  const internalLinks = [...html.matchAll(/href="(\/[^"#?]*)/g)]
    .map((m) => m[1].replace(/\/$/, "") || "/")
    .filter((p) => !p.startsWith("/_next") && !p.startsWith("/api"));

  return {
    path,
    template: templateOf(path),
    status: res.status,
    title: (/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim(),
    description: (/<meta name="description" content="([^"]*)"/i.exec(html)?.[1] ?? "").trim(),
    h1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
    canonical: /<link rel="canonical" href="([^"]*)"/i.exec(html)?.[1] ?? null,
    noindex: /<meta name="robots"[^>]*content="[^"]*noindex/i.test(html),
    hasBreadcrumbs: html.includes('"@type":"BreadcrumbList"'),
    affiliateLinks: external.filter(([, , href]) => /ebay|tcgplayer|amazon/i.test(href)).length,
    unsponsoredOutbound: [...new Set(unsponsored)],
    paywalled: PAYWALL_MARKERS.some((re) => re.test(html)),
    authWall: AUTH_MARKERS.some((re) => re.test(html)),
    softFourOhFour: res.status === 200 && (text.length < 200 || SOFT_404_MARKERS.some((re) => re.test(text))),
    emptyServerRender,
    rawText: text,
    sentences,
    editorialWords: 0, // filled in after boilerplate is known
    internalLinks: [...new Set(internalLinks)],
  };
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// ── URL discovery ────────────────────────────────────────────────────────────
async function allUrls(): Promise<string[]> {
  const index = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
  const childSitemaps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = new Set<string>();
  for (const sm of childSitemaps) {
    const path = new URL(sm).pathname;
    try {
      const body = await fetch(`${BASE}${path}`).then((r) => r.text());
      for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        urls.add(new URL(m[1]).pathname);
      }
    } catch {
      /* a section that fails to build is reported by the crawl check, not here */
    }
  }
  return [...urls];
}

// Spread a sample across a group rather than taking the first N — the first N
// card URLs are alphabetical and would over-represent one set.
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}

async function main() {
  console.log(`Auditing ${BASE}\n`);
  const urls = await allUrls();
  console.log(`${urls.length} URLs in the sitemaps`);

  const groups = new Map<string, string[]>();
  for (const u of urls) {
    const t = templateOf(u);
    (groups.get(t) ?? groups.set(t, []).get(t)!).push(u);
  }

  const sampleUrls: string[] = [];
  for (const [, list] of groups) sampleUrls.push(...spread(list.sort(), SAMPLE));
  console.log(`Sampling ${sampleUrls.length} of them across ${groups.size} templates…\n`);

  const fetched = (await pool(sampleUrls, CONCURRENCY, fetchPage)).filter(Boolean) as Page[];

  // ── Boilerplate, detected rather than listed ───────────────────────────────
  // Two passes, because "boilerplate" means two different things here:
  //
  //   SITEWIDE — a sentence on >35% of all sampled pages is site chrome: the
  //     affiliate disclosure, the Riot notice, "prices update daily". This is
  //     the "boilerplate disclaimers" exclusion.
  //   PER TEMPLATE — a sentence on >35% of pages WITHIN one template is the
  //     template's own fixed prose. On a 1,064-page card catalogue that is the
  //     thing under review: text that exists 1,064 times is not this page's
  //     content, however many words it is. Subtracting it is what makes the
  //     number mean "unique editorial words" rather than "words".
  const countIn = (pages: Page[]) => {
    const m = new Map<string, number>();
    for (const p of pages) for (const s of new Set(p.sentences)) m.set(s, (m.get(s) ?? 0) + 1);
    return m;
  };
  const siteCounts = countIn(fetched);
  const boilerplate = new Set(
    [...siteCounts].filter(([, c]) => c / fetched.length > BOILERPLATE_THRESHOLD).map(([s]) => s),
  );

  const templated = new Map<string, Set<string>>();
  for (const [template] of groups) {
    const pages = fetched.filter((p) => p.template === template);
    if (pages.length < 3) {
      templated.set(template, new Set());
      continue; // too few samples for a share to mean anything
    }
    const counts = countIn(pages);
    templated.set(
      template,
      new Set([...counts].filter(([, c]) => c / pages.length > BOILERPLATE_THRESHOLD).map(([s]) => s)),
    );
  }
  const templatedTotal = [...templated.values()].reduce((n, s) => n + s.size, 0);
  console.log(
    `${boilerplate.size} sitewide boilerplate sentences + ${templatedTotal} per-template templated sentences excluded\n`,
  );

  const editorialText = new Map<string, string>();
  for (const p of fetched) {
    const tpl = templated.get(p.template)!;
    const own = p.sentences.filter((s) => !boilerplate.has(s) && !tpl.has(s)).join(" ");
    editorialText.set(p.path, own);
    p.editorialWords = wordsOf(own).length;
  }

  // ── per-group report ───────────────────────────────────────────────────────
  type GroupReport = {
    template: string;
    totalUrls: number;
    sampled: number;
    medianEditorialWords: number;
    minEditorialWords: number;
    maxEditorialWords: number;
    thin: string[];
    medianSimilarity: number;
    medianTemplateSimilarity: number;
    duplicateCluster: { share: number; medianTemplateSimilarity: number } | null;
  };
  const reports: GroupReport[] = [];

  for (const [template, list] of [...groups].sort()) {
    const pages = fetched.filter((p) => p.template === template);
    if (!pages.length) continue;
    const counts = pages.map((p) => p.editorialWords).sort((a, b) => a - b);
    const median = counts[Math.floor(counts.length / 2)];

    // All-pairs similarity within the group, on both measures.
    const raw = pages.map((p) => shingles(wordsOf(editorialText.get(p.path) ?? "")));
    const masked = pages.map((p) => shingles(templateWords(editorialText.get(p.path) ?? "")));
    const rawSims: number[] = [];
    const tplSims: number[] = [];
    let highlySimilar = 0;
    for (let i = 0; i < pages.length; i++) {
      let peers = 0;
      for (let j = 0; j < pages.length; j++) {
        if (i === j) continue;
        const t = jaccard(masked[i], masked[j]);
        if (i < j) {
          rawSims.push(jaccard(raw[i], raw[j]));
          tplSims.push(t);
        }
        if (t > DUP_SIMILARITY) peers++;
      }
      if (peers > 0) highlySimilar++;
    }
    const share = pages.length > 1 ? highlySimilar / pages.length : 0;
    rawSims.sort((a, b) => a - b);
    tplSims.sort((a, b) => a - b);
    const med = (xs: number[]) => Number((xs[Math.floor(xs.length / 2)] ?? 0).toFixed(3));

    reports.push({
      template,
      totalUrls: list.length,
      sampled: pages.length,
      medianEditorialWords: median,
      minEditorialWords: counts[0],
      maxEditorialWords: counts[counts.length - 1],
      thin: pages.filter((p) => p.editorialWords < THIN_WORDS && !p.noindex).map((p) => p.path),
      medianSimilarity: med(rawSims),
      medianTemplateSimilarity: med(tplSims),
      duplicateCluster:
        share > DUP_CLUSTER_SHARE ? { share: Number(share.toFixed(2)), medianTemplateSimilarity: med(tplSims) } : null,
    });
  }

  // ── sitewide flags ─────────────────────────────────────────────────────────
  const indexable = fetched.filter((p) => !p.noindex);
  const thin = indexable.filter((p) => p.editorialWords < THIN_WORDS);
  const softFourOhFours = fetched.filter((p) => p.softFourOhFour);
  const paywalled = indexable.filter((p) => p.paywalled);
  const authWalled = fetched.filter((p) => p.authWall);
  const affiliateThin = indexable.filter((p) => p.affiliateLinks > 0 && p.editorialWords < THIN_WORDS);
  const unsponsored = fetched.filter((p) => p.unsponsoredOutbound.length);

  // Metadata hygiene (Phase 11b / 16a).
  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  for (const p of indexable) {
    (titles.get(p.title) ?? titles.set(p.title, []).get(p.title)!).push(p.path);
    (descriptions.get(p.description) ?? descriptions.set(p.description, []).get(p.description)!).push(p.path);
  }
  const dupTitles = [...titles].filter(([t, ps]) => t && ps.length > 1);
  const dupDescriptions = [...descriptions].filter(([d, ps]) => d && ps.length > 1);
  const badH1 = indexable.filter((p) => p.h1Count !== 1);
  const noCanonical = indexable.filter((p) => !p.canonical);

  const emptySsr = fetched.filter((p) => p.emptyServerRender);
  // Card pages with no price data at all that are STILL indexable — the
  // population Phase 7a de-indexes. Detected from the page's own honest
  // "no live listings" copy rather than a second database query, so the check
  // measures what a visitor actually sees.
  const emptyCards = fetched.filter(
    (p) => p.template === "card" && !p.noindex && /No live listings for .+ yet/i.test(p.rawText),
  );

  const totals = {
    urlsInSitemaps: urls.length,
    sampled: fetched.length,
    indexableSampled: indexable.length,
    indexableThin: thin.length,
    duplicateClusters: reports.filter((r) => r.duplicateCluster).length,
    softFourOhFours: softFourOhFours.length,
    emptyServerRender: emptySsr.length,
    indexableEmptyCards: emptyCards.length,
    paywalledIndexable: paywalled.length,
    authWalled: authWalled.length,
    affiliateWithoutEditorial: affiliateThin.length,
    unsponsoredOutboundPages: unsponsored.length,
    duplicateTitles: dupTitles.length,
    duplicateDescriptions: dupDescriptions.length,
    wrongH1Count: badH1.length,
    missingCanonical: noCanonical.length,
  };

  const out = {
    generatedFrom: BASE,
    sampleSize: SAMPLE,
    thresholds: { thinWords: THIN_WORDS, boilerplateThreshold: BOILERPLATE_THRESHOLD, shingle: SHINGLE, dupSimilarity: DUP_SIMILARITY, dupClusterShare: DUP_CLUSTER_SHARE },
    totals,
    groups: reports,
    detail: {
      thin: thin.map((p) => ({ path: p.path, words: p.editorialWords })).sort((a, b) => a.words - b.words),
      softFourOhFours: softFourOhFours.map((p) => p.path),
      emptyServerRender: emptySsr.map((p) => p.path),
      indexableEmptyCards: emptyCards.map((p) => p.path),
      paywalledIndexable: paywalled.map((p) => p.path),
      authWalled: authWalled.map((p) => p.path),
      affiliateWithoutEditorial: affiliateThin.map((p) => ({ path: p.path, words: p.editorialWords, affiliateLinks: p.affiliateLinks })),
      unsponsoredOutbound: unsponsored.map((p) => ({ path: p.path, hrefs: p.unsponsoredOutbound.slice(0, 5) })),
      duplicateTitles: dupTitles.map(([t, ps]) => ({ title: t, paths: ps })),
      duplicateDescriptions: dupDescriptions.map(([d, ps]) => ({ description: d.slice(0, 80), paths: ps })),
      wrongH1Count: badH1.map((p) => ({ path: p.path, h1s: p.h1Count })),
      missingCanonical: noCanonical.map((p) => p.path),
    },
  };

  mkdirSync(join(process.cwd(), "docs"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 2));

  // ── readable summary ───────────────────────────────────────────────────────
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  console.log(
    `${pad("TEMPLATE", 20)}${pad("URLS", 7)}${pad("SMPL", 6)}${pad("MED", 6)}${pad("MIN", 6)}${pad("MAX", 6)}${pad("THIN", 6)}${pad("SIM", 7)}${pad("TPL-SIM", 9)}DUP CLUSTER`,
  );
  console.log("─".repeat(96));
  for (const r of reports) {
    console.log(
      pad(r.template, 20) + pad(r.totalUrls, 7) + pad(r.sampled, 6) +
        pad(r.medianEditorialWords, 6) + pad(r.minEditorialWords, 6) + pad(r.maxEditorialWords, 6) +
        pad(r.thin.length, 6) + pad(r.medianSimilarity, 7) + pad(r.medianTemplateSimilarity, 9) +
        (r.duplicateCluster ? `YES — ${(r.duplicateCluster.share * 100).toFixed(0)}% of sampled pages` : "no"),
    );
  }
  console.log("\n  SIM     = median Jaccard on 8-word shingles (the brief's measure)");
  console.log("  TPL-SIM = same, with card/set/champion names, numbers and money masked out.");
  console.log("            This is the one that reflects how templated the page really reads.");

  console.log("\nSITEWIDE");
  for (const [k, v] of Object.entries(totals)) console.log(`  ${pad(k, 30)} ${v}`);
  console.log(`\nWrote ${OUT}`);
}

void main();
