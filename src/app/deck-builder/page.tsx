import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { VisualDeckBuilder } from "@/components/deck-builder/VisualDeckBuilder";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage, ldJson, webPage } from "@/lib/jsonld";
import { COPY_LIMIT, MAIN_DECK_TOTAL, SIDE_MAX } from "@/lib/deck-builder";

// The visual deck builder (2026-10-21, DECISIONS.md "A visual deck builder").
// The page is static (the builder loads its cards from /api/deck-builder/cards),
// refreshed daily like every other card page.
export const revalidate = 86400;

const TITLE = "Riftbound Deck Builder — build, check and share decks free";
const DESCRIPTION = `A free visual Riftbound deck builder: drag and drop every card, hover to preview, live rules checks (${MAIN_DECK_TOTAL}-card main deck, ${COPY_LIMIT}-copy limit, ${SIDE_MAX}-card side deck), energy curve, deck price in your currency, and a 6-character share code.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pageAlternates("/deck-builder"),
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/deck-builder", images: ["/blog/riftbound-deck-builder.jpg"] }),
};

const FAQS = [
  {
    q: "Is the RiftCompare deck builder free?",
    a: "Yes. Every feature is free and works without an account: building, the rules check, saving in your browser, sharing with a code, and pricing the deck.",
  },
  {
    q: "What rules does it check?",
    a: `One Legend, one Champion unit of that Legend's champion, a ${MAIN_DECK_TOTAL}-card main deck with the Champion included, 12 Runes, 3 different Battlefields, a side deck of up to ${SIDE_MAX}, and at most ${COPY_LIMIT} copies of a card across the main and side deck together. It also warns when your cards span more than two domains.`,
  },
  {
    q: "How do I share a deck?",
    a: "Press Share code. You get a six-character code and a link, riftcompare.com/d/CODE, that opens your deck in the builder for anyone. Anyone can also type the code into the builder's \"Have a deck code?\" box.",
  },
  {
    q: "Where are my decks saved?",
    a: "In your browser. The deck you are working on saves itself as you build, and Save keeps named copies you can reopen later on this device. Share a code to open a deck somewhere else.",
  },
  {
    q: "How much will my deck cost?",
    a: "The builder adds up the cheapest copy of every card at the stores we track in your market. Press \"Find the cheapest way to buy it\" to send the whole list to Best Basket, which plans the cheapest delivered order.",
  },
];

export default function DeckBuilderPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({ name: "Riftbound Deck Builder", href: "/deck-builder", description: DESCRIPTION }),
            faqPage(FAQS),
          ),
        }}
      />
      <Breadcrumbs trail={[{ name: "Deck builder", href: "/deck-builder" }]} />
      <header className="mb-5">
        <span className="chip mb-2 inline-flex bg-emerald-500/15 text-[11px] font-bold uppercase tracking-wide text-emerald-300">Free · no account needed</span>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-4xl">Riftbound Deck Builder</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
          Build a Riftbound deck visually: search every card, drag it into your deck, hover for a big preview. The builder checks the
          tournament rules as you go, draws your energy curve, prices the deck at the cheapest stores in your currency, and gives you a
          six-character code to share it. Pasting a list to price instead? Use the <Link href="/deck" className="text-brand-300 hover:underline">deck pricer</Link>.
        </p>
      </header>

      <VisualDeckBuilder />

      <section className="mt-10 max-w-3xl" aria-labelledby="deck-builder-faq">
        <h2 id="deck-builder-faq" className="text-xl font-extrabold text-white">Deck builder questions</h2>
        <div className="mt-3 space-y-2">
          {FAQS.map((f) => (
            <details key={f.q} className="card-surface rounded-xl border border-ink-700">
              <summary className="cursor-pointer p-3 text-sm font-semibold text-white">{f.q}</summary>
              <p className="px-3 pb-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-400">
          New to deck building? <Link href="/guides/how-a-riftbound-deck-is-built" className="text-brand-300 hover:underline">How a Riftbound deck is built</Link> explains every zone.
        </p>
      </section>
    </div>
  );
}
