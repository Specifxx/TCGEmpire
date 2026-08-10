/**
 * scripts/template-seo-check.ts — per-TEMPLATE metadata + structured-data check.
 *
 *   npx tsx scripts/template-seo-check.ts --url http://localhost:3111
 *   npx tsx scripts/template-seo-check.ts --url https://riftcompare.com --samples 5
 *
 * Prints a matrix of every page template × the signals that decide whether that
 * template is eligible for rich results, and exits non-zero if a template is
 * missing something it should have.
 *
 * WHY PER-TEMPLATE AND NOT PER-PAGE. scripts/seo-gate.ts already checks all ~1,700
 * URLs for the things that must be true of EVERY page (a title, one canonical, no
 * accidental noindex). This asks the different question: does each TEMPLATE emit
 * the structured data appropriate to what it is? A card page without Product is a
 * template defect that seo-gate cannot see, because a missing Product node is not
 * an error on any individual page — it is only wrong relative to what that kind of
 * page is supposed to be. Sampling a few URLs per template is enough, because a
 * template either emits a node or it doesn't.
 *
 * Expectations are declared per template below, and a template that gains a
 * requirement it doesn't meet fails loudly rather than silently drifting.
 */
export {};

const args = process.argv.slice(2);
const argOf = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf("--url", "http://localhost:3111").replace(/\/$/, "");
const SAMPLES = Number(argOf("--samples", "3"));
const UA = "Mozilla/5.0 (compatible; RiftCompare-TemplateSeo/1.0)";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", B = "\x1b[1m", O = "\x1b[0m";

/** Structured-data types a template MUST emit. BreadcrumbList is expected on
 *  every indexable template — it is the hierarchy signal, and the crawl check
 *  already treats its absence as a defect. */
interface Spec {
  name: string;
  test: (p: string) => boolean;
  requires: string[];
  /** Types that are allowed but not required — reported, never failed. */
  optional?: string[];
}

const SPECS: Spec[] = [
  { name: "card", test: (p) => p.startsWith("/card/"), requires: ["BreadcrumbList", "Product", "FAQPage"] },
  { name: "decks/archetype", test: (p) => p.startsWith("/decks/archetype/"), requires: ["BreadcrumbList", "ItemList", "FAQPage"] },
  { name: "decks/domain", test: (p) => p.startsWith("/decks/domain/"), requires: ["BreadcrumbList", "ItemList", "FAQPage"] },
  { name: "deck", test: (p) => /^\/decks\/[^/]+$/.test(p) && p !== "/decks", requires: ["BreadcrumbList"] },
  { name: "champion", test: (p) => p.startsWith("/champions/") && p !== "/champions", requires: ["BreadcrumbList", "ItemList"] },
  { name: "keyword", test: (p) => p.startsWith("/keywords/") && p !== "/keywords", requires: ["BreadcrumbList", "DefinedTerm"] },
  { name: "domain", test: (p) => p.startsWith("/domains/") && p !== "/domains", requires: ["BreadcrumbList", "CollectionPage"] },
  { name: "facet", test: (p) => /^\/cards\/(type|rarity|printing)\//.test(p), requires: ["BreadcrumbList"] },
  { name: "set", test: (p) => /^\/sets\/[^/]+$/.test(p) && p !== "/sets", requires: ["BreadcrumbList", "CollectionPage"] },
  { name: "set/gallery", test: (p) => /^\/sets\/[^/]+\/gallery$/.test(p), requires: ["BreadcrumbList", "ItemList"] },
  { name: "store", test: (p) => p.startsWith("/stores/") && p !== "/stores", requires: ["BreadcrumbList", "Organization"] },
  { name: "guide", test: (p) => p.startsWith("/guides/"), requires: ["BreadcrumbList"], optional: ["FAQPage", "Article", "BlogPosting", "TechArticle"] },
  { name: "blog", test: (p) => p.startsWith("/blog/"), requires: ["BreadcrumbList"], optional: ["FAQPage", "Article", "BlogPosting", "NewsArticle"] },
  { name: "author", test: (p) => p.startsWith("/authors/"), requires: ["BreadcrumbList"], optional: ["Person", "ProfilePage"] },
];
const specOf = (p: string) => SPECS.find((s) => s.test(p));

interface Result {
  path: string;
  status: number;
  canonicalOk: boolean;
  canonicalDetail: string;
  ogOk: boolean;
  ogMissing: string[];
  types: string[];
  ldParseError: string | null;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

/** OG tags that actually matter for a shared link. og:image is required
 *  separately per template only where a bespoke image exists, so it is reported
 *  but never failed — the site-wide default is a legitimate answer. */
const OG_REQUIRED = ["og:title", "og:description", "og:url", "og:type"];

function ldTypes(html: string): { types: string[]; error: string | null } {
  const types: string[] = [];
  let error: string | null = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== "object") return;
        const o = n as Record<string, unknown>;
        if (Array.isArray(o["@graph"])) o["@graph"].forEach(walk);
        const t = o["@type"];
        if (typeof t === "string") types.push(t);
        else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") types.push(x);
        // Nested entities count: a Product's offers, an ItemList's items.
        for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
      };
      walk(JSON.parse(m[1]));
    } catch (e) {
      error = String(e).slice(0, 100);
    }
  }
  return { types: [...new Set(types)], error };
}

async function check(path: string): Promise<Result> {
  const res = await fetch(`${BASE}${path}`, { headers: { "user-agent": UA, accept: "text/html" } });
  const html = await res.text();
  const head = html.slice(0, (html.indexOf("</head>") + 7) || html.length);

  const canonicals = [
    ...[...head.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi)].map((m) => decode(m[1])),
    ...[...head.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/gi)].map((m) => decode(m[1])),
  ];
  const uniq = [...new Set(canonicals)];
  let canonicalOk = false;
  let canonicalDetail = `${uniq.length} tags`;
  if (uniq.length === 1) {
    const self = new URL(uniq[0]).pathname.replace(/\/+$/, "") || "/";
    canonicalOk = self === (path.replace(/\/+$/, "") || "/");
    if (!canonicalOk) canonicalDetail = `→ ${self}`;
  }

  const og = new Map<string, string>();
  for (const m of head.matchAll(/<meta[^>]+property=["'](og:[^"']+)["'][^>]+content=["']([^"']*)["']/gi))
    og.set(m[1], decode(m[2]));
  for (const m of head.matchAll(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["'](og:[^"']+)["']/gi))
    og.set(m[2], decode(m[1]));
  const ogMissing = OG_REQUIRED.filter((k) => !og.get(k));

  const { types, error } = ldTypes(html);
  return { path, status: res.status, canonicalOk, canonicalDetail, ogOk: ogMissing.length === 0, ogMissing, types, ldParseError: error };
}

async function main(): Promise<void> {
  console.log(`\n${B}Template SEO check — ${BASE}${O}\n`);

  // Sample URLs per template out of the sitemap, so this always tests real,
  // currently-published pages rather than a hand-maintained URL list that rots.
  const idx = await fetch(`${BASE}/sitemap.xml`, { headers: { "user-agent": UA } }).then((r) => r.text());
  const children = [...idx.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const all: string[] = [];
  for (const c of children) {
    const xml = await fetch(`${BASE}${c}`, { headers: { "user-agent": UA } }).then((r) => r.text());
    for (const m of xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)) all.push(new URL(m[1]).pathname.replace(/\/+$/, "") || "/");
  }

  let failures = 0;
  const rows: string[] = [];
  const nameW = Math.max(...SPECS.map((s) => s.name.length));

  for (const spec of SPECS) {
    const pool = all.filter((p) => specOf(p)?.name === spec.name);
    if (!pool.length) {
      rows.push(`  ${spec.name.padEnd(nameW)}  ${D}no published URLs — skipped${O}`);
      continue;
    }
    // Evenly spaced samples, so we don't only ever test the first few.
    const step = Math.max(1, Math.floor(pool.length / SAMPLES));
    const picks = Array.from({ length: Math.min(SAMPLES, pool.length) }, (_, i) => pool[i * step]);
    const results = await Promise.all(picks.map(check));

    const canonBad = results.filter((r) => !r.canonicalOk);
    const ogBad = results.filter((r) => !r.ogOk);
    const ldBad = results.filter((r) => r.ldParseError);
    const seen = new Set(results.flatMap((r) => r.types));
    const missing = spec.requires.filter((t) => !results.every((r) => r.types.includes(t)));
    const present = spec.optional?.filter((t) => seen.has(t)) ?? [];

    const mark = (ok: boolean) => (ok ? `${G}✓${O}` : `${R}✗${O}`);
    const bits = [
      `${mark(!canonBad.length)} canonical`,
      `${mark(!ogBad.length)} og`,
      `${mark(!missing.length && !ldBad.length)} schema`,
    ].join("  ");
    const detail: string[] = [];
    if (canonBad.length) detail.push(`canonical: ${canonBad.map((r) => `${r.path} (${r.canonicalDetail})`).join(", ")}`);
    if (ogBad.length) detail.push(`og missing: ${[...new Set(ogBad.flatMap((r) => r.ogMissing))].join(", ")}`);
    if (ldBad.length) detail.push(`invalid JSON-LD: ${ldBad[0].ldParseError}`);
    if (missing.length) detail.push(`schema missing: ${missing.join(", ")}`);

    failures += canonBad.length + ogBad.length + ldBad.length + missing.length;
    rows.push(
      `  ${spec.name.padEnd(nameW)}  ${bits}   ${D}${pool.length} pages · required [${spec.requires.join(", ")}]` +
        `${present.length ? ` · also [${present.join(", ")}]` : ""}${O}` +
        (detail.length ? `\n  ${" ".repeat(nameW)}  ${Y}${detail.join("; ")}${O}` : "")
    );
  }

  console.log(rows.join("\n"));
  console.log(
    failures === 0
      ? `\n${G}${B}All templates emit a self-canonical, complete OpenGraph and their required structured data.${O}\n`
      : `\n${R}${B}${failures} template-level problem${failures === 1 ? "" : "s"}.${O}\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`${R}template-seo-check crashed:${O}`, e);
  process.exit(1);
});
