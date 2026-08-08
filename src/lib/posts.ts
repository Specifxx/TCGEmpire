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
  // `!a.draft` for the same reason the reports are excluded: this feeds /blog,
  // the RSS/JSON feeds and the Google News sitemap, and an unfinished post must
  // not reach any of them.
  return ARTICLES.filter((a) => a.category === "blog" && !a.draft).sort((a, b) => (a.date < b.date ? 1 : -1));
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

// getLatestMarketReport() is GONE. Report generation is deleted (see
// lib/market-report.ts), so "the newest report row" is a permanently-ageing
// legacy row — every caller had to wrap it in its own freshness check to stop
// surfacing months-old numbers as today's, and each of those checks was already
// permanently false. The Discord poster and admin/social now just don't feature a
// wrap, and the weekly newsletter no longer links one. Individual legacy reports
// stay reachable by direct URL via getMarketReportPost above.
