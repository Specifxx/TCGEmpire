// Unifies the two sources of blog content: the hand-written file articles
// (lib/articles.ts) and the auto-generated daily MarketReport rows. Both are
// presented as the same Article shape so the blog list and ArticleView render
// them identically.
import { prisma } from "./db";
import { ARTICLES, getArticle, type Article } from "./articles";
import { parseReportData, type ReportData } from "./market-report";

const REPORT_AUTHOR = "RiftCompare Markets Desk";
const REPORT_TAGS = ["market report", "RiftCompare Index", "prices", "daily"];

type ReportRow = { slug: string; day: string; title: string; excerpt: string; body: string };

function reportToArticle(r: ReportRow): Article {
  return {
    slug: r.slug,
    category: "blog",
    title: r.title,
    excerpt: r.excerpt,
    author: REPORT_AUTHOR,
    date: r.day,
    readMins: Math.max(2, Math.round(r.body.split(/\s+/).length / 200)),
    tags: REPORT_TAGS,
    body: r.body,
  };
}

// All hand-written blog posts, newest first. Auto-generated MarketReport rows are
// DELIBERATELY excluded here — this feeds the public /blog list, the RSS/JSON
// feeds and the Google News sitemap, and a run of near-identical templated pages
// on those surfaces is exactly the "scaled content abuse" shape that put the
// AdSense application at risk (see lib/market-report.ts's header comment).
// Individual report pages still resolve directly via getMarketReportPost/
// getBlogPost for anyone who already has the URL; they just don't get surfaced.
export async function getBlogPosts(): Promise<Article[]> {
  return ARTICLES.filter((a) => a.category === "blog").sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Resolve a single blog post by slug from either source.
export async function getBlogPost(slug: string): Promise<Article | null> {
  const file = getArticle(slug);
  if (file && file.category === "blog") return file;
  const r = await prisma.marketReport
    .findUnique({ where: { slug }, select: { slug: true, day: true, title: true, excerpt: true, body: true } })
    .catch(() => null);
  return r ? reportToArticle(r) : null;
}

// A market report with its structured chart payload (null for rows that predate
// charts — those fall back to the plain ArticleView).
export interface MarketReportPost {
  article: Article;
  day: string;
  data: ReportData | null;
}

const REPORT_SELECT = { slug: true, day: true, title: true, excerpt: true, body: true, data: true } as const;

export async function getMarketReportPost(slug: string): Promise<MarketReportPost | null> {
  const r = await prisma.marketReport.findUnique({ where: { slug }, select: REPORT_SELECT }).catch(() => null);
  return r ? { article: reportToArticle(r), day: r.day, data: parseReportData(r.data) } : null;
}

// The newest report row, if one exists. Generation is stopped (see
// lib/market-report.ts) and nothing on the public site surfaces this anymore —
// only internal tooling (admin/social, the Discord poster) still reads it, and
// only when it's actually fresh (see each caller's freshness check).
export async function getLatestMarketReport(): Promise<MarketReportPost | null> {
  const r = await prisma.marketReport
    .findFirst({ orderBy: { day: "desc" }, select: REPORT_SELECT })
    .catch(() => null);
  return r ? { article: reportToArticle(r), day: r.day, data: parseReportData(r.data) } : null;
}
