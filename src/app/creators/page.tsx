import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, DISCORD_URL, FACEBOOK_URL, INSTAGRAM_URL, SITE_NAME, SITE_URL, X_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { CREATOR_PARTNERS } from "@/lib/content/creators";

// /creators — two audiences on one page: a visitor looking for where to follow
// the site, and a content creator sizing up whether to partner with it. Static
// (no DB read, no live prices), same ISR shape as /about and /methodology.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Socials & Creator Partners",
  description:
    "Follow RiftCompare on Discord, Instagram, X and Facebook, meet the Riftbound creators we partner with, and find out how to partner with us.",
  alternates: pageAlternates("/creators"),
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Socials & Creators", item: `${SITE_URL}/creators` },
  ],
};
const pageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `Socials & Creator Partners — ${SITE_NAME}`,
  url: `${SITE_URL}/creators`,
  description:
    "Where to follow RiftCompare, the Riftbound content creators we partner with, and how to become one.",
  publisher: { "@id": `${SITE_URL}/#org` },
};

// Same brand-hover-colour pattern as the footer's own social row (app/layout.tsx)
// — one canonical set of official links, never a second copy that could drift.
const SOCIALS = [
  { label: "Discord", href: DISCORD_URL, hover: "hover:border-[#5865F2] hover:text-[#5865F2]", blurb: "Chat with the community, report a bad price, get pinged on drops." },
  { label: "Instagram", href: INSTAGRAM_URL, hover: "hover:border-[#E1306C] hover:text-[#E1306C]", blurb: "Set previews, price-check graphics and site updates." },
  { label: "X", href: X_URL, hover: "hover:border-white hover:text-white", blurb: "The fastest place we post price movers and new features." },
  { label: "Facebook", href: FACEBOOK_URL, hover: "hover:border-[#1877F2] hover:text-[#1877F2]", blurb: "Same updates, for the Facebook-group crowd." },
] as const;

export default function CreatorsPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([breadcrumbLd, pageLd]) }}
      />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Socials &amp; Creators</span>
      </nav>
      <h1 className="text-3xl font-extrabold leading-tight text-white">Socials &amp; Creator Partners</h1>
      <p className="mt-2 text-sm text-slate-500">
        Where to follow {SITE_NAME}, who we partner with, and how to become one.
      </p>

      <div className="mt-6 space-y-8 border-t border-ink-800 pt-6">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Follow {SITE_NAME}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`card-surface flex flex-col gap-1 border border-transparent p-4 transition-colors ${s.hover}`}
              >
                <span className="text-sm font-bold text-white">{s.label}</span>
                <span className="text-xs text-slate-500">{s.blurb}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Creator partners</h2>
          {CREATOR_PARTNERS.length === 0 ? (
            <div className="card-surface p-5 text-sm leading-relaxed text-slate-400">
              <p>
                We&rsquo;re just starting to partner with Riftbound creators — this list is empty for now,
                but it won&rsquo;t stay that way for long. If you make Riftbound content, see below.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {[...CREATOR_PARTNERS]
                .sort((a, b) => b.since.localeCompare(a.since))
                .map((c) => (
                  <a
                    key={c.url}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-surface flex flex-col gap-1 border border-transparent p-4 transition-colors hover:border-brand-500"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">{c.name}</span>
                      <span className="chip bg-ink-800 px-1.5 py-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {c.platform}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">{c.blurb}</span>
                    <span className="text-xs text-brand-400">{c.handle}</span>
                  </a>
                ))}
            </div>
          )}
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="text-lg font-bold text-white">Make Riftbound content? Let&rsquo;s talk</h2>
          <p>
            We&rsquo;re reaching out to Riftbound creators to build real partnerships — not a one-off shoutout,
            an ongoing relationship: a mention in your content, a link back to {SITE_NAME}, or however else
            makes sense for what you make. In return we can promote your channel here and across our own
            socials above, and set you up with whatever from the site is useful to your content.
          </p>
          <p>
            One concrete thing already built for this: live, embeddable price widgets — a chrome-free badge
            you can drop straight into a blog post, a Discord-linked site or a newsletter as an{" "}
            <code className="rounded bg-ink-800 px-1 py-0.5 text-xs">&lt;iframe&gt;</code>, no build step on
            your end. Two are live today — the market index, and any single card&rsquo;s cheapest price —
            and both stay live and link back to the full comparison on {SITE_NAME}:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-slate-400">
{`<iframe src="${SITE_URL}/embed/index" width="300" height="150" frameborder="0"></iframe>

<iframe src="${SITE_URL}/embed/card/<card-slug>" width="300" height="150" frameborder="0"></iframe>`}
          </pre>
          <p className="text-xs text-slate-500">
            Swap <code className="rounded bg-ink-800 px-1 py-0.5">&lt;card-slug&gt;</code> for any card&rsquo;s
            page slug — the part after <code className="rounded bg-ink-800 px-1 py-0.5">/card/</code> on its
            RiftCompare page, e.g. <code className="rounded bg-ink-800 px-1 py-0.5">jinx-loose-cannon-ogn-251-298</code>
            — and add <code className="rounded bg-ink-800 px-1 py-0.5">?market=uk</code> (or au/us/sg/ca/eu)
            to either URL for a market other than the US default.
          </p>
          <p>
            If that sounds like something you&rsquo;d want, email{" "}
            <a href={`mailto:${CONTACT_EMAIL}?subject=Creator%20partnership`} className="text-gold hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            with a link to your channel — a real person reads every one.
          </p>
        </section>
      </div>
    </article>
  );
}
