/**
 * scripts/check-site-quality.ts — crawl the site and report:
 *   - broken internal links (any internal href answering >= 400)
 *   - indexable pages with a missing, duplicate title or meta description
 *   - placeholder text ("lorem ipsum", "coming soon", "TODO") in page HTML
 *
 *   npx tsx scripts/check-site-quality.ts                       # https://riftcompare.com, 250 pages
 *   npx tsx scripts/check-site-quality.ts --url http://localhost:3000 --max 500
 *
 * Seeds: the homepage plus a sample of every child sitemap. Follows internal
 * links breadth-first up to --max HTML pages; every other internal href it sees
 * is checked with a HEAD request. Read-only. Exit 1 on any broken link.
 */
const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const BASE = arg("--url", "https://riftcompare.com").replace(/\/$/, "");
const MAX = Number(arg("--max", "250"));
const PER_SITEMAP = Number(arg("--per-sitemap", "15"));
const CONCURRENCY = 4;

interface PageInfo {
  url: string;
  status: number;
  title: string | null;
  description: string | null;
  noindex: boolean;
  placeholders: string[];
}

const pages = new Map<string, PageInfo>();
const linkStatus = new Map<string, number>();
const linkedFrom = new Map<string, string>();

const PLACEHOLDER = /lorem ipsum|dolor sit amet|>\s*coming soon\s*<|>\s*(todo|tbd|placeholder)\s*</gi;

function normalise(href: string, from: string): string | null {
  try {
    const u = new URL(href, from);
    if (u.origin !== new URL(BASE).origin) return null;
    if (/\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|xml|txt|json|pdf|woff2?)$/i.test(u.pathname)) return null;
    if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/_next/")) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "RiftCompare-site-quality-check" } });
    const ct = r.headers.get("content-type") ?? "";
    return { status: r.status, body: ct.includes("text/html") || ct.includes("xml") ? await r.text() : "" };
  } catch {
    return { status: 0, body: "" };
  }
}

function meta(html: string, name: string): string | null {
  const m =
    html.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, "i")) ??
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+name="${name}"`, "i"));
  return m ? m[1] : null;
}

async function seeds(): Promise<string[]> {
  const out = [`${BASE}/`];
  const index = await fetchText(`${BASE}/sitemap.xml`);
  const children = [...index.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const child of children) {
    const sm = await fetchText(child.replace("https://riftcompare.com", BASE));
    const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace("https://riftcompare.com", BASE));
    out.push(...locs.slice(0, PER_SITEMAP));
  }
  return out;
}

async function crawl() {
  const queue = await seeds();
  const queued = new Set(queue);
  while (queue.length && pages.size < MAX) {
    const batch = queue.splice(0, CONCURRENCY);
    await Promise.all(
      batch.map(async (url) => {
        const { status, body } = await fetchText(url);
        linkStatus.set(url, status);
        const robots = meta(body, "robots") ?? "";
        pages.set(url, {
          url,
          status,
          title: body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null,
          description: meta(body, "description"),
          noindex: /noindex/i.test(robots),
          placeholders: [...new Set([...body.replace(/<script[\s\S]*?<\/script>/gi, "").matchAll(PLACEHOLDER)].map((m) => m[0].trim()))],
        });
        for (const m of body.matchAll(/<a\s[^>]*href="([^"]+)"/gi)) {
          const link = normalise(m[1].replace(/&amp;/g, "&"), url);
          if (!link) continue;
          if (!linkedFrom.has(link)) linkedFrom.set(link, url);
          if (!queued.has(link)) {
            queued.add(link);
            queue.push(link);
          }
        }
      }),
    );
  }
  // HEAD-check every discovered link that was not crawled as a page.
  const rest = [...linkedFrom.keys()].filter((l) => !linkStatus.has(l));
  for (let i = 0; i < rest.length; i += CONCURRENCY * 2) {
    await Promise.all(
      rest.slice(i, i + CONCURRENCY * 2).map(async (l) => {
        try {
          const r = await fetch(l, { method: "HEAD", redirect: "follow" });
          linkStatus.set(l, r.status);
        } catch {
          linkStatus.set(l, 0);
        }
      }),
    );
  }
}

function dupes(field: "title" | "description"): [string, string[]][] {
  const by = new Map<string, string[]>();
  for (const p of pages.values()) {
    if (p.noindex || p.status !== 200 || !p[field]) continue;
    by.set(p[field]!, [...(by.get(p[field]!) ?? []), p.url]);
  }
  return [...by].filter(([, urls]) => urls.length > 1);
}

(async () => {
  console.log(`Crawling ${BASE} (max ${MAX} pages)…`);
  await crawl();
  const indexable = [...pages.values()].filter((p) => p.status === 200 && !p.noindex);
  const broken = [...linkStatus].filter(([, s]) => s >= 400 || s === 0);
  const missingTitle = indexable.filter((p) => !p.title);
  const missingDesc = indexable.filter((p) => !p.description);
  const placeholders = indexable.filter((p) => p.placeholders.length);
  const dupTitles = dupes("title");
  const dupDescs = dupes("description");

  console.log(`\nPages crawled: ${pages.size} (${indexable.length} indexable) · links checked: ${linkStatus.size}`);
  console.log(`Broken internal links: ${broken.length}`);
  for (const [l, s] of broken.slice(0, 50)) console.log(`  ${s} ${l}  (linked from ${linkedFrom.get(l) ?? "seed"})`);
  console.log(`Indexable pages missing a title: ${missingTitle.length}`);
  for (const p of missingTitle.slice(0, 20)) console.log(`  ${p.url}`);
  console.log(`Indexable pages missing a meta description: ${missingDesc.length}`);
  for (const p of missingDesc.slice(0, 20)) console.log(`  ${p.url}`);
  console.log(`Duplicate titles among indexable pages: ${dupTitles.length}`);
  for (const [t, urls] of dupTitles.slice(0, 20)) console.log(`  "${t}" ×${urls.length}: ${urls.slice(0, 3).join(", ")}`);
  console.log(`Duplicate descriptions among indexable pages: ${dupDescs.length}`);
  for (const [d, urls] of dupDescs.slice(0, 20)) console.log(`  "${d.slice(0, 80)}…" ×${urls.length}: ${urls.slice(0, 3).join(", ")}`);
  console.log(`Indexable pages with placeholder text: ${placeholders.length}`);
  for (const p of placeholders.slice(0, 20)) console.log(`  ${p.url}: ${p.placeholders.join(", ")}`);
  process.exit(broken.length > 0 ? 1 : 0);
})();
export {};
