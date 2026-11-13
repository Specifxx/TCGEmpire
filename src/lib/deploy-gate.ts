/**
 * What the after-deploy gate is looking at (.github/workflows/seo-preview-gate.yml).
 *
 * A Vercel deployment's own address (https://<project>-<hash>-<team>.vercel.app, the `environment_url` of a
 * `deployment_status` event) is behind Vercel's sign-in: every request is redirected to vercel.com and ends on the
 * "Log in to Vercel" page. Until 2026-11-13 the gate checked that address. Its template SEO check read the login page
 * as a sitemap, found no URL, skipped every template and passed; its Lighthouse step timed the login page, and nothing
 * in either log said so (DECISIONS.md, "The after-deploy gate was checking Vercel's sign-in page").
 *
 * The gate now checks production at the public address. These three questions are what keep "the address showed us
 * something else" from ever being a quiet pass again: each check asks one before it trusts what it read. Pure, so
 * `tests/deploy-gate.test.ts` can ask them of a sign-in page without a network.
 */

/** An address's host ("riftcompare.com", "localhost:3000"), or "" when it is not an address. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

const oneLine = (s: unknown, max: number): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export interface SitemapAnswer {
  /** The origin that was asked, e.g. https://riftcompare.com (no trailing slash). */
  base: string;
  /** Where the request for `<base>/sitemap.xml` ended, redirects followed. */
  finalUrl: string;
  status: number;
  body: string;
}

/**
 * Why the answer to `<base>/sitemap.xml` cannot be this site's sitemap, or null when it can.
 * The template check samples the pages a sitemap lists, so an address that answers with anything else has shown it
 * nothing, and "nothing to check" must fail, never pass.
 */
export function sitemapProblem(a: SitemapAnswer): string | null {
  const asked = hostOf(a.base);
  const landed = hostOf(a.finalUrl);
  if (asked && landed && landed !== asked) {
    return `${a.base} sent the request to ${landed}, which is another site's page (a sign-in wall?), not this site`;
  }
  if (a.status !== 200) return `${a.base}/sitemap.xml answered HTTP ${a.status}`;
  if (!/<loc>\s*[^<\s]/.test(a.body)) {
    return `${a.base}/sitemap.xml lists no pages (it begins "${oneLine(a.body, 70)}")`;
  }
  return null;
}

/** The parts of a Lighthouse result (the JSON report) this file reads. */
export interface LighthouseResult {
  finalDisplayedUrl?: string;
  mainDocumentUrl?: string;
  /** Lighthouse 9 and earlier. */
  finalUrl?: string;
  audits?: Record<string, { details?: unknown } | undefined>;
}

/**
 * Where a Lighthouse run ended, and whether that is the host it was sent to. A run that was redirected to another
 * host measured that host's page: its numbers say nothing about ours, and must never be compared with our budget
 * or written as our baseline.
 */
export function lighthouseLanding(requestedUrl: string, lhr: LighthouseResult): { url: string; sameHost: boolean } {
  const url = lhr.finalDisplayedUrl || lhr.mainDocumentUrl || lhr.finalUrl || "";
  const asked = hostOf(requestedUrl);
  return { url, sameHost: asked !== "" && asked === hostOf(url) };
}

interface ReportNode {
  snippet?: unknown;
  selector?: unknown;
  nodeLabel?: unknown;
}

/** The first element a Lighthouse audit's details name, wherever in them it sits. */
function findNode(o: unknown): ReportNode | null {
  if (!o || typeof o !== "object") return null;
  const rec = o as Record<string, unknown>;
  if (rec.type === "node" && (rec.snippet || rec.selector)) return rec as ReportNode;
  const inner = rec.node as ReportNode | undefined;
  if (inner && typeof inner === "object" && (inner.snippet || inner.selector)) return inner;
  for (const v of Object.values(rec)) {
    const hit = findNode(v);
    if (hit) return hit;
  }
  return null;
}

/**
 * The element Lighthouse timed as the largest paint: its opening tag and the text it holds, or null when the report
 * names none. Lighthouse 13 reports it inside the "LCP breakdown" insight; older versions had an audit of its own.
 * One line of it in the log is the difference between "the largest paint took 11.9s" and "the largest paint was the
 * heading of a login page".
 */
export function largestPaintElement(lhr: LighthouseResult): { snippet: string; text: string } | null {
  const audits = lhr.audits ?? {};
  for (const id of ["lcp-breakdown-insight", "largest-contentful-paint-element", "lcp-discovery-insight"]) {
    const node = findNode(audits[id]?.details);
    if (node) return { snippet: oneLine(node.snippet ?? node.selector, 150), text: oneLine(node.nodeLabel, 60) };
  }
  return null;
}
