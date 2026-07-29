import type { Metadata } from "next";
import Link from "next/link";
import { getPopularCards } from "@/lib/cheapest-cards";
import { getCountry } from "@/lib/get-country";
import { cardDisplayName } from "@/lib/card-name";
import { isoCountry } from "@/lib/country";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Free Riftbound Price Widget — Embed Live Card Prices",
  description:
    "Add a free, auto-updating Riftbound price badge to your website, blog, store or Discord. It always shows the cheapest live price across stores and links back to the full comparison.",
  alternates: { canonical: "/widgets" },
  openGraph: {
    title: "Free Riftbound Price Widget",
    description:
      "Embed a live, auto-updating Riftbound card price on any site. Always shows the cheapest price across stores.",
    url: `${SITE_URL}/widgets`,
  },
};

function Benefit({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{children}</p>
    </div>
  );
}

export default async function WidgetsPage() {
  const country = getCountry();
  const examples = await getPopularCards(3, country);

  return (
    <div className="flex flex-col gap-10">
      <Breadcrumbs trail={[{ name: "Price Widget", href: "/widgets" }]} />
      {/* Hero */}
      <section className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600/20 via-ink-850 to-gold/10 px-6 py-12 text-center">
          <span className="chip mb-4 border border-brand-500/30 bg-brand-500/10 text-brand-300">
            Free forever · no sign-up
          </span>
          <h1 className="mx-auto max-w-2xl text-2xl font-extrabold text-white sm:text-4xl">
            Embed a live Riftbound price on your site
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
            Drop a small badge anywhere — a blog post, a store page, a Discord-linked site — and it
            shows the cheapest live price for a card across {SITE_NAME}&apos;s tracked stores,
            updating itself every day. No JavaScript, no account, free for anyone to use.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/browse" className="btn-primary">Pick a card to embed</Link>
            <a href="#how" className="btn-ghost">How it works</a>
          </div>
        </div>
      </section>

      {/* Why use it */}
      <section>
        <div className="grid gap-3 sm:grid-cols-3">
          <Benefit title="Always up to date">
            The badge pulls the latest cheapest price every day, so the figure on your page is never
            stale — no manual updating.
          </Benefit>
          <Benefit title="Lightweight & safe">
            A plain, cacheable <code>&lt;iframe&gt;</code> — no scripts to install, nothing that can
            slow down or track your visitors.
          </Benefit>
          <Benefit title="Links back for buyers">
            Each badge links to the full price comparison, so your readers can click through and buy
            from the cheapest store.
          </Benefit>
        </div>
      </section>

      {/* Live examples */}
      <section>
        <h2 className="mb-1 text-xl font-extrabold text-white">Copy a live example</h2>
        <p className="mb-4 text-xs text-slate-500">
          These are real, live widgets for some of the most-searched cards. Copy the snippet, or open
          any card and grab its own badge.
        </p>
        {examples.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((c) => (
              <EmbedSnippet
                key={c.id}
                title={cardDisplayName(c.name, c)}
                src={`${SITE_URL}/embed/card/${c.slug ?? c.id}?market=${country}`}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            <Link href="/browse" className="text-brand-400 hover:underline">Browse the database</Link>{" "}
            and open any card to grab its embed code.
          </p>
        )}
      </section>

      {/* How it works */}
      <section id="how" className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">How to add it</h2>
        <ol className="mt-3 max-w-2xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>
            Open any card on{" "}
            <Link href="/browse" className="text-brand-400 hover:underline">the database</Link> and
            click <strong className="text-white">“Embed this live price”</strong> (or copy an example
            above).
          </li>
          <li>Paste the <code className="text-slate-200">&lt;iframe&gt;</code> snippet into your page&apos;s HTML.</li>
          <li>
            That&apos;s it — the badge renders the current cheapest price and refreshes on its own.
          </li>
        </ol>
        <div className="mt-5 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h3 className="text-sm font-bold text-white">Customise it</h3>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-400">
            <li><code className="text-slate-200">width</code> / <code className="text-slate-200">height</code> — resize to fit your layout (the badge scales down on narrow screens).</li>
            <li><code className="text-slate-200">?market=</code> — set the market it prices in: <code className="text-slate-200">{isoCountry(country)}</code> for your region, or <code className="text-slate-200">AU</code>, <code className="text-slate-200">NZ</code>, <code className="text-slate-200">US</code>, <code className="text-slate-200">GB</code>.</li>
          </ul>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "Is the Riftbound price widget free?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `Yes. The ${SITE_NAME} price widget is completely free to embed on any website, blog or store, with no account required.`,
                },
              },
              {
                "@type": "Question",
                name: "Does the embedded price update automatically?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes. The widget shows the cheapest live price across tracked stores and refreshes daily, so it never goes stale.",
                },
              },
            ],
          }),
        }}
      />
    </div>
  );
}
