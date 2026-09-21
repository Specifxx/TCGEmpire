import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { STATIC_PAGE_DATES } from "@/lib/static-page-dates";
import { pageAlternates } from "@/lib/seo";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Free Riftbound widgets for your site",
  description:
    "Three embeddable Riftbound widgets — a live card price badge, the market index and a set release countdown. Copy one line of HTML. Free, no signup, no tracking.",
  alternates: pageAlternates("/embed"),
};

// ─────────────────────────────────────────────────────────────────────────────
// THE HUMAN-FACING DIRECTORY OF THE EMBED WIDGETS.
// ─────────────────────────────────────────────────────────────────────────────
// Three widgets have been live and working for months — /embed/card/[id],
// /embed/index and /embed/release-countdown — and until now NOTHING on the site,
// in the docs or in any outreach material told anyone they existed. Each route's
// own header calls it "a compounding backlink + brand engine"; an engine nobody
// can find is not one.
//
// WHY THIS IS A PAGE AND NOT A DOCS FILE. It is the thing partnership outreach
// points at (docs/OUTREACH-KIT.md). The ask in those emails is deliberately not
// "please link us" — it is "here is a widget your readers would want", and that
// only works if there is a public URL where a webmaster can see the widget
// running, copy one line and be done. A markdown file in the repo cannot do that.
//
// NOTE ON HEADERS. /embed (bare) is an ordinary page and deliberately does NOT
// inherit the widgets' `frame-ancestors *` — see next.config.js, where the rule
// is scoped to `/embed/:path+` for exactly this reason.
//
// DELIBERATELY NO LIVE PREVIEW IFRAMES OF OUR OWN WIDGETS HERE. Each preview
// would be a real request to a database-backed route on every render of this
// page; the widgets already carry their own revalidate windows and the egress
// rules at the top of lib/db.ts are the reason this page shows CODE and links
// out to the running widget instead of framing three of them inline.

type Widget = {
  name: string;
  href: string;
  what: string;
  who: string;
  snippet: string;
  height: number;
  options: { param: string; detail: string }[];
};

// The card widget's example uses a real, stable card slug so a webmaster who
// pastes the snippet unedited sees a working badge rather than an empty box.
const WIDGETS: Widget[] = [
  {
    name: "Card price badge",
    href: "/embed/card/irelia-fervent-sfd-225s-221",
    what:
      "A live “from $X across N stores” badge for any single card, with the card art, the cheapest current price and a link through to the full comparison.",
    who:
      "Deck guides and set reviews. Drop one under each card you mention and the page tells readers what that card costs today, without you maintaining a price table.",
    snippet:
      '<iframe src="https://riftcompare.com/embed/card/CARD-SLUG" width="100%" height="150" style="border:0" loading="lazy" title="Riftbound card price"></iframe>',
    height: 150,
    options: [
      {
        param: "?market=US",
        detail: "AU, US, UK, SG, CA or EU. Sets the currency and which stores are compared. Defaults to Australia.",
      },
      {
        param: "CARD-SLUG",
        detail:
          "The last part of any card’s RiftCompare URL. Open the card page and copy what follows /card/.",
      },
    ],
  },
  {
    name: "Market index",
    href: "/embed/index",
    what:
      "The RiftCompare Index as a compact badge — the current level, the 7-day change and a sparkline of the recent trend.",
    who:
      "News sites, newsletters and sidebars. One line that makes a page feel current every day without anyone updating it.",
    snippet:
      '<iframe src="https://riftcompare.com/embed/index" width="100%" height="120" style="border:0" loading="lazy" title="Riftbound market index"></iframe>',
    height: 120,
    options: [
      { param: "?market=UK", detail: "AU, US, UK, SG, CA or EU. Unrecognised values fall back to the default market." },
    ],
  },
  {
    name: "Release countdown",
    href: "/embed/release-countdown",
    what:
      "A ticking countdown to the next Riftbound set, with the release date underneath.",
    who:
      "Community sites and Discord-linked blogs, especially during a preview season. Names no set in code, so it moves to the next release by itself the day the current one ships.",
    snippet:
      '<iframe src="https://riftcompare.com/embed/release-countdown" width="100%" height="140" style="border:0" loading="lazy" title="Riftbound set release countdown"></iframe>',
    height: 140,
    options: [],
  },
];

export default function EmbedDirectoryPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Free Riftbound widgets",
    url: `${SITE_URL}/embed`,
    dateModified: STATIC_PAGE_DATES["/embed"],
    description: metadata.description,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <div className="flex flex-col gap-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div>
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Free Riftbound widgets for your site</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Three live widgets you can drop into any page with one line of HTML. They pull current data from{" "}
          {SITE_NAME} every time someone loads your page, so they stay right without you touching them.
          Free, no signup, no account, no tracking pixel &mdash; and no attribution required, though a link is
          always welcome.
        </p>
      </div>

      {WIDGETS.map((w) => (
        <section key={w.href} className="card-surface flex flex-col gap-3 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-white">{w.name}</h2>
            <Link href={w.href} className="text-xs font-semibold text-brand-400 hover:underline">
              See it running &rarr;
            </Link>
          </div>
          <p className="text-sm leading-relaxed text-slate-400">{w.what}</p>
          <p className="text-sm leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-400">Good for:</span> {w.who}
          </p>
          <pre className="overflow-x-auto rounded-lg border border-ink-800 bg-ink-950 p-4 text-xs leading-relaxed text-slate-300">
            <code>{w.snippet}</code>
          </pre>
          {w.options.length > 0 && (
            <dl className="flex flex-col gap-2 text-xs text-slate-500">
              {w.options.map((o) => (
                <div key={o.param} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                  <dt className="shrink-0 font-mono font-semibold text-slate-400">{o.param}</dt>
                  <dd className="leading-relaxed">{o.detail}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}

      <section className="card-surface flex flex-col gap-3 p-6">
        <h2 className="text-lg font-bold text-white">The fine print, such as it is</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-slate-400">
          <li>
            <span className="font-semibold text-slate-300">They cost you nothing and always will.</span> There is no
            plan, no key and no rate limit to worry about for normal use.
          </li>
          <li>
            <span className="font-semibold text-slate-300">Prices are the cheapest in-stock listing we can see</span> at
            our last check, and stores change them between checks. The widget links through to the full comparison so a
            reader can confirm before buying &mdash; the same caveat every price on this site carries.
          </li>
          <li>
            <span className="font-semibold text-slate-300">The widgets are marked noindex.</span> Embedding one will not
            put duplicate content on your site or compete with your own pages in search.
          </li>
          <li>
            <span className="font-semibold text-slate-300">Nothing is set in a cookie</span> and no visitor of yours is
            identified or followed by them.
          </li>
          <li>
            <span className="font-semibold text-slate-300">Want one that does not exist yet?</span> Tell us what your
            readers need and we will look at building it.{" "}
            <Link href="/feedback" className="text-brand-400 hover:underline">
              Send a request
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="card-surface p-6 text-center">
        <h2 className="text-lg font-bold text-white">Run a Riftbound store?</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-slate-400">
          These widgets are for anyone with a website. There is a separate side of RiftCompare for retailers
          &mdash; a free listing in the comparison, and a look at where your prices sit in the market.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Link href="/stores" className="btn-primary inline-flex">
            See what we do for retailers &rarr;
          </Link>
          <Link href="/creators" className="btn-ghost inline-flex">
            Riftbound creators we follow
          </Link>
        </div>
      </section>
    </div>
  );
}
