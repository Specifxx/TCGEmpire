import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Country } from "@/lib/country";
import { getArticles, type Article } from "@/lib/articles";
import { articleHref } from "@/lib/content/tool-guides";
import { MARKET_READS, startHereFor, type HomePick } from "@/lib/content/featured";

// "Guides, news & market updates" — the homepage's editorial band, DIRECTLY
// UNDER THE HERO on all six market homes, above the "Riftbound card prices
// today" table.
//
// MOVED ABOVE THE TABLE (owner, 2026-09-28: "we need the blog and guides to be
// prominent so that we get approved for adsense with their lazy crawlers").
// Under the table it began one to two screens down, behind 15 price rows; now
// it is the first band after the hero, in the server HTML with every link a
// plain <a>, so a crawler that neither scrolls nor runs scripts meets the
// writing before the price data.
//
// WHY IT WAS ADDED (owner decision, 2026-09-26, "Blog and tools, joined up" in
// DECISIONS.md). After an AdSense "low value content" rejection the owner asked
// for the homepage to feature its writing prominently. The two "Latest from the
// blog" / "Guides & explainers" rows this replaces sat about nine phone screens
// down, behind every affiliate unit on the page, and showed only the newest
// posts. The owner chose this slot over one lower inside HomeSections, which
// reverses the 2026-09-21 order for this one band: Top Deals, eBay Picks and the
// playable cards keep their order, one band further down.
//
// WHAT IS IN IT, all real and none of it a new query:
//  - Start here: owner-curated evergreen guides (lib/content/featured.ts). A
//    market home leads with that market's own buying guide, so the six bands
//    differ where it matters most.
//  - Latest news: the three newest blog posts, the same list /blog opens with.
//  - Market updates: the freshness figure the page already loads for the hero
//    (getHomeStats), the movers page, the Index and how it is built, and the
//    curated posts that read our own price data. Not a movers grid: Market
//    Pulse was removed on the owner's instruction (2026-09-17) and the popular
//    carousel already has a Biggest movers tab.
//
// PHONES: text first, images only from md up. Every row is a 44px tap target
// with the date or reading time beside the title; the one-line description
// joins it from md. ARTICLES is an in-memory constant, so this costs no DB
// read on an ISR page (src/lib/db.ts rules 5 and 6), and it stays a server
// component: only trimmed fields are rendered, so no article body reaches the
// client.

const NEWS_COUNT = 3;
const INDEX_GUIDE_SLUG = "understanding-the-riftcompare-index-methodology";

type Teaser = {
  href: string;
  title: string;
  line: string;
  /** ISO date shown beside the title, with its label. */
  date?: { iso: string; label?: string };
  readMins?: number;
  hero: { src: string; alt: string } | null;
};

function toTeaser(a: Article, line: string, date?: Teaser["date"]): Teaser {
  return { href: articleHref(a), title: a.title, line, date, readMins: date ? undefined : a.readMins, hero: a.hero ?? null };
}

// "26 Sep", with the year only once it is not this year's.
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

export function EditorialHub({ freshness, market }: {
  /** getHomeStats().freshness, the "Xh ago" the hero already shows. */
  freshness: string | null;
  /** A region home's own market; omitted on "/", whose copy is market-neutral. */
  market?: Country;
}) {
  const published = getArticles();
  const bySlug = new Map(published.map((a) => [a.slug, a]));
  const resolve = (picks: HomePick[], withDate: boolean): Teaser[] =>
    picks.flatMap((p) => {
      const a = bySlug.get(p.slug);
      if (!a) return [];
      return [toTeaser(a, p.line, withDate ? { iso: a.updated ?? a.date, label: "Updated" } : undefined)];
    });

  const startHere = resolve(startHereFor(market), false);
  const news = published
    .filter((a) => a.category === "blog")
    .slice(0, NEWS_COUNT)
    .map((a) => toTeaser(a, a.excerpt, { iso: a.date }));
  // A market read that is also one of the newest posts is already in the news
  // column; list it once.
  const reads = resolve([...MARKET_READS], true).filter((t) => !news.some((n) => n.href === t.href));
  const indexGuide = bySlug.get(INDEX_GUIDE_SLUG);

  if (!startHere.length && !news.length) return null;

  return (
    <section aria-labelledby="editorial-hub-h" className="card-surface p-4 sm:p-5">
      <h2 id="editorial-hub-h" className="text-xl font-extrabold text-white">
        Guides, news &amp; market updates
      </h2>

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        <Column title="Start here">
          <ul>
            {startHere.map((t, i) => (
              <TeaserRow key={t.href} t={t} phoneHidden={i >= PHONE_ROWS} />
            ))}
          </ul>
        </Column>

        <Column title="Latest news">
          <ul>
            {news.map((t, i) => (
              <TeaserRow key={t.href} t={t} withImage={i === 0} phoneHidden={i >= PHONE_ROWS} />
            ))}
          </ul>
        </Column>

        <Column title="Market updates">
          {freshness && (
            <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
              <span aria-hidden="true" className="text-up">●</span> Prices updated {freshness} · store prices imported twice a day
            </p>
          )}
          <ul>
            <TeaserRow
              t={{ href: "/movers", title: "Price movers", line: "This week's biggest risers and drops, and the cards searched most.", hero: null }}
            />
            <li className="flex items-start justify-between gap-3 md:flex-col md:gap-0">
              <RowLink href="/market" title="The RiftCompare Index" line="One weekly number for the most-searched cards' prices." />
              {indexGuide && (
                <Link
                  href={articleHref(indexGuide)}
                  className="tap-link shrink-0 py-1.5 text-[11px] font-semibold text-brand-300 underline-offset-2 hover:underline md:py-0"
                >
                  How it&apos;s built<span className="sr-only">: the Index methodology guide</span>
                </Link>
              )}
            </li>
            {reads.map((t, i) => (
              <TeaserRow key={t.href} t={t} phoneHidden={i >= PHONE_ROWS - 1} />
            ))}
          </ul>
        </Column>
      </div>

      {/* The owner's statement of how articles are produced (lib/content/
          authors.ts ARTICLE_PROCESS), in a short form of its own: the full
          sentence is on /about, /authors and the author pages. The links ride
          in the sentence rather than in a row of their own, which on a phone
          would add two 48px rows to a band meant to stay near one screen. */}
      <p className="mt-4 border-t border-ink-800 pt-3 text-xs leading-relaxed text-slate-500">
        Guides and posts are drafted with AI assistance, then edited and fact-checked by Bill, who{" "}
        <Link href="/about" className="text-brand-300 underline-offset-2 hover:underline">runs RiftCompare</Link>; prices
        and figures come from our own price database (
        <Link href="/methodology" className="text-brand-300 underline-offset-2 hover:underline">how we collect them</Link>
        ), never from the draft.{" "}
        <Link href="/editorial-policy" className="text-brand-300 underline-offset-2 hover:underline">Editorial policy</Link>
        {" · "}
        <Link href="/guides" className="font-semibold text-brand-300 underline-offset-2 hover:underline">All guides →</Link>
        {" · "}
        <Link href="/blog" className="font-semibold text-brand-300 underline-offset-2 hover:underline">All posts →</Link>
      </p>
    </section>
  );
}

// Rows per column on phones. Every row keeps the 48px touch target, so ten of
// them made the band ~800px on a 390px phone and pushed Today's Top Deals more
// than a screen further down than the owner was told when choosing this spot
// (2026-09-26). Below md each column shows its first two (Market updates: its
// two tool links and one read); the rest are CSS-hidden, still in the HTML, and
// shown from md where the three columns sit side by side.
const PHONE_ROWS = 2;

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

// Title with its date or reading time beside it on phones; from md, the
// one-line description joins it and the date drops underneath.
function TeaserRow({ t, withImage = false, phoneHidden = false }: { t: Teaser; withImage?: boolean; phoneHidden?: boolean }) {
  const meta = t.date ? (
    <time dateTime={t.date.iso}>
      {t.date.label && <span className="hidden md:inline">{t.date.label} </span>}
      {shortDate(t.date.iso)}
    </time>
  ) : t.readMins ? (
    `${t.readMins} min read`
  ) : null;
  return (
    <li className={phoneHidden ? "hidden md:block" : undefined}>
      <RowLink href={t.href} title={t.title} line={t.line} meta={meta} image={withImage ? t.hero : null} />
    </li>
  );
}

function RowLink({
  href,
  title,
  line,
  meta,
  image = null,
}: {
  href: string;
  title: string;
  line: string;
  meta?: ReactNode;
  image?: Teaser["hero"];
}) {
  return (
    <Link href={href} className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1.5">
      {/* md up only, so a phone never downloads it (a lazy image inside a
          display:none box is not fetched). `fill` inside the relative aspect
          box keeps it out of flow: an in-flow intrinsic width once zoomed the
          whole site out on phones (tests/hero-image-fit.test.ts). Decorative:
          the title beside it is the link text. */}
      {image && (
        <span className="relative mb-2 hidden aspect-[1.91/1] w-full overflow-hidden rounded-md bg-ink-900 md:block">
          <Image
            src={image.src}
            alt=""
            fill
            sizes="(min-width: 1280px) 330px, 33vw"
            loading="lazy"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </span>
      )}
      <span className="flex items-start justify-between gap-3 md:flex-col md:gap-0.5">
        <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-slate-100 group-hover:text-brand-300 md:line-clamp-3">
          {title}
        </span>
        {meta && <span className="shrink-0 pt-0.5 text-[11px] leading-4 text-slate-500 md:order-last md:pt-0">{meta}</span>}
        <span className="hidden text-xs leading-snug text-slate-400 md:line-clamp-2">{line}</span>
      </span>
    </Link>
  );
}
