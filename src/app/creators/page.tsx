import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CONTACT_EMAIL, DISCORD_URL, FACEBOOK_URL, INSTAGRAM_URL, SITE_NAME, SITE_URL, X_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { getCreators } from "@/lib/content/creators-server";
import { CreatorCard, PackIcon } from "@/components/creators/CreatorCard";
import { CreatorApplyForm } from "@/components/creators/CreatorApplyForm";
import { HubFaq } from "@/components/HubFaq";
import { faqPage, ldJson } from "@/lib/jsonld";

// /creators: the Riftbound creators hub (rebuilt 2026-10-15, owner: "a section for
// creators... very nice, cute, very cool... list their social media... a little
// widget or option to donate your favourite Riftbound creator a coffee, or a pack").
// Two audiences: players finding creators to follow and tip, and creators deciding
// whether a listing is worth a mention in their content. The list is static
// (lib/content/creators.ts), so this page reads no database.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Riftbound Creators: Follow & Buy Them a Pack",
  description:
    "The Riftbound content creators we feature: deck techs, pack openings and more. Follow them, and buy your favourite a pack. Creators: get featured free.",
  alternates: pageAlternates("/creators"),
  openGraph: pageOpenGraph({
    title: "Riftbound Creators on RiftCompare",
    description: "Follow your favourite Riftbound creators and buy them a pack. Make Riftbound content? Get featured free.",
    url: "/creators",
  }),
};

const FAQS = [
  {
    q: "What does \"Buy them a pack\" do?",
    a: "It opens the creator's own tip page (Ko-fi, Buy Me a Coffee, Patreon or similar). The money goes straight to them. RiftCompare never handles it and takes no cut.",
  },
  {
    q: "Does it cost anything to be featured?",
    a: "No. A listing is free. We ask featured creators to mention RiftCompare in their content, for example a link in a video description or a price check on screen, and we send our visitors their way in return.",
  },
  {
    q: "Who can apply?",
    a: "Anyone who makes Riftbound content regularly: YouTube, TikTok, Twitch, Instagram, X, podcasts or a blog. Audience size matters less than making good Riftbound content. A real person reviews every application.",
  },
  {
    q: "Will I see how many clicks my listing sends?",
    a: "Yes. We count clicks on every featured creator's links and tip button, and share the numbers with them on request.",
  },
];

const SOCIALS = [
  { label: "Discord", href: DISCORD_URL, bg: "#5865F2", blurb: "Chat, report a bad price, get pinged on drops." },
  { label: "Instagram", href: INSTAGRAM_URL, bg: "#E1306C", blurb: "Set previews and price-check graphics." },
  { label: "X", href: X_URL, bg: "#000000", blurb: "Price movers and new features, first." },
  { label: "Facebook", href: FACEBOOK_URL, bg: "#1877F2", blurb: "Same updates, for the group crowd." },
] as const;

const PERKS = [
  {
    icon: "📣",
    title: "A spotlight card, free",
    body: "Your avatar, what you make and every channel you're on, here and in the creators widget on our homepage.",
  },
  {
    icon: "🎴",
    title: "A \"Buy them a pack\" button",
    body: "Straight to your own Ko-fi, Patreon or tip page. Fans support you directly; we never touch the money.",
  },
  {
    icon: "📈",
    title: "Riftbound players, not random traffic",
    body: "Thousands of players visit every week to price cards, open sealed and plan decks: the people who watch Riftbound content.",
  },
  {
    icon: "🤝",
    title: "Shout-outs and real numbers",
    body: "We share your new videos on our socials, and tell you how many clicks your listing sent you.",
  },
];

const HERO_ART = [
  { src: "/radiance-spoilers/seraphine-starry-eyed-songstress.jpg", cls: "left-0 top-8 -rotate-[10deg]" },
  { src: "/radiance-spoilers/ekko-boy-who-shattered-time.jpg", cls: "left-[88px] top-0 z-10 rotate-[2deg]" },
  { src: "/radiance-spoilers/heartsteel-ksante-courageous.jpg", cls: "left-[176px] top-10 rotate-[11deg]" },
];

export default async function CreatorsPage() {
  const creators = await getCreators();
  const ld = ldJson(
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Riftbound Creators", item: `${SITE_URL}/creators` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Riftbound Creators — ${SITE_NAME}`,
      url: `${SITE_URL}/creators`,
      publisher: { "@id": `${SITE_URL}/#org` },
      ...(creators.length
        ? {
            mainEntity: {
              "@type": "ItemList",
              itemListElement: creators.map((c, i) => ({
                "@type": "ListItem",
                position: i + 1,
                item: { "@type": "Person", name: c.name, sameAs: c.links.map((l) => l.url) },
              })),
            },
          }
        : {}),
    },
    faqPage(FAQS),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">
          Home
        </Link>
        <span>/</span>
        <span className="text-slate-300">Riftbound Creators</span>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-fuchsia-400/20 bg-gradient-to-br from-fuchsia-500/15 via-ink-900 to-sky-500/15 p-6 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 right-10 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative z-10 max-w-xl">
          <span className="chip inline-flex bg-fuchsia-400/15 text-[11px] font-bold uppercase tracking-wide text-fuchsia-200">
            ✦ Creators
          </span>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            Riftbound creators we <span className="bg-gradient-to-r from-fuchsia-300 to-amber-200 bg-clip-text text-transparent">love</span>
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-300">
            The people who make Riftbound fun to follow: deck techs, pack openings, tournament runs and hot takes. Watch
            them, follow them, and buy your favourite a pack.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href="#featured"
              className="inline-flex min-h-11 items-center rounded-xl bg-white px-5 text-sm font-extrabold text-ink-950 transition-transform hover:scale-[1.02]"
            >
              Meet the creators
            </a>
            <a
              href="#apply"
              className="inline-flex min-h-11 items-center rounded-xl border border-white/20 px-5 text-sm font-bold text-white hover:bg-white/10"
            >
              I make Riftbound content →
            </a>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute right-6 top-8 hidden h-64 w-80 md:block">
          {HERO_ART.map((a) => (
            <Image
              key={a.src}
              src={a.src}
              alt=""
              width={140}
              height={196}
              className={`absolute rounded-xl shadow-2xl shadow-black/60 ring-1 ring-white/15 ${a.cls}`}
            />
          ))}
        </div>
      </header>

      {/* Featured creators */}
      <section id="featured" className="mt-10 scroll-mt-header">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-extrabold text-white">Featured creators</h2>
            <p className="mt-1 text-sm text-slate-400">
              {creators.length
                ? "Newest first. Tap a channel to follow, or buy them a pack to say thanks."
                : "Our first creators are joining now. Want to be one of them?"}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c, i) => (
            <CreatorCard key={c.slug} creator={c} index={i} />
          ))}
          {/* Open spots fill the last row (a full row of three while the list is
              empty), so the grid reads as "join us" rather than a finished list.
              Never an invented creator. */}
          {Array.from({ length: creators.length === 0 ? 3 : (3 - (creators.length % 3)) % 3 || 3 }).map((_, i) => (
            <a
              key={`open-${i}`}
              href="#apply"
              className="group flex min-h-72 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] p-6 text-center transition-colors hover:border-fuchsia-300/60 hover:bg-fuchsia-400/5"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-400/30 to-sky-400/30 text-3xl transition-transform group-hover:scale-110">
                ✨
              </span>
              <span className="mt-4 text-base font-extrabold text-white">Your channel here</span>
              <span className="mt-1 max-w-[16rem] text-sm text-slate-400">
                Make Riftbound content? Get a free spotlight card and a &ldquo;Buy them a pack&rdquo; button.
              </span>
              <span className="mt-4 text-sm font-bold text-fuchsia-200">Apply to be featured →</span>
            </a>
          ))}
        </div>
      </section>

      {/* How tipping works */}
      <section className="mt-10 grid items-center gap-6 rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-900 p-6 sm:grid-cols-[auto,1fr] sm:p-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-gold to-amber-300 text-ink-950 shadow-lg shadow-gold/20">
          <PackIcon className="h-10 w-10" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-white">Buy your favourite creator a pack</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Every featured creator with a tip page gets a &ldquo;Buy them a pack&rdquo; button. It goes straight to
            their own Ko-fi, Patreon or tip page, so <strong className="text-white">100% of what you send goes to them</strong>.{" "}
            {SITE_NAME} never handles the money and takes no cut. It&rsquo;s the easiest way to say thanks for the
            deck tech that won you a game.
          </p>
        </div>
      </section>

      {/* For creators */}
      <section className="mt-10">
        <h2 className="text-2xl font-extrabold text-white">Make Riftbound content? Let&rsquo;s grow together</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Mention {SITE_NAME} in your content (a link in your description, a price check on screen, a shout-out in a
          reel) and we&rsquo;ll send our visitors your way. It&rsquo;s free, and you can stop any time.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-white/10 bg-ink-900 p-5">
              <span className="text-3xl" aria-hidden>
                {p.icon}
              </span>
              <h3 className="mt-3 font-extrabold text-white">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-400">
          Bonus for your content: live price badges and a release countdown you can embed anywhere.{" "}
          <Link href="/embed" className="font-semibold text-brand-300 hover:underline">
            See the widgets →
          </Link>
        </p>
      </section>

      {/* Creator codes (2026-10-16): the paid programme has its own page. */}
      <section className="mt-10 rounded-3xl border border-gold/30 bg-gold/[0.06] p-6 sm:p-8">
        <h2 className="text-2xl font-extrabold text-white">Earn with your own code</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          Get a RiftCompare creator code: your audience gets 20% off Premium, and you earn 20% of every payment they make.
        </p>
        <Link href="/creators/apply" className="btn-primary mt-4 inline-flex min-h-11 items-center px-5">
          Apply for a creator code →
        </Link>
      </section>

      {/* Apply */}
      <section id="apply" className="mt-10 scroll-mt-header rounded-3xl border border-brand-500/25 bg-gradient-to-br from-brand-500/10 via-ink-900 to-ink-900 p-6 sm:p-8">
        <h2 className="text-2xl font-extrabold text-white">Get featured</h2>
        <p className="mt-1 text-sm text-slate-400">
          Tell us about your channel. A real person reviews every application and replies by email. Prefer email?{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Creator%20partnership`} className="text-gold hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
        <div className="mt-5">
          <CreatorApplyForm />
        </div>
      </section>

      {/* Follow us */}
      <section className="mt-10">
        <h2 className="text-xl font-extrabold text-white">Follow {SITE_NAME}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-900 p-4 transition-transform hover:-translate-y-0.5"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
                style={{ backgroundColor: s.bg }}
                aria-hidden
              >
                {s.label[0]}
              </span>
              <span>
                <span className="block text-sm font-bold text-white">{s.label}</span>
                <span className="block text-xs text-slate-400">{s.blurb}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <HubFaq faqs={FAQS} heading="Creators FAQ" className="mt-10" />
    </div>
  );
}
