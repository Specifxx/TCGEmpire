import Link from "next/link";
import { Reveal } from "@/components/Reveal";

// A first-time-visitor explainer: the search -> compare -> buy mechanic in three
// scannable steps. The hero says WHAT RiftCompare is; this says HOW to use it, which
// is the piece a newcomer to a price-comparison tool is missing. Market-neutral copy
// (no cookie reads) so it stays part of the ISR-cached, one-version-for-all page and
// doubles as keyword-relevant content for search.
const STEPS = [
  {
    n: 1,
    icon: "🔍",
    title: "Search or browse",
    body: "Look up any Riftbound card by name, or browse the whole database by set and domain.",
  },
  {
    n: 2,
    icon: "⚖️",
    title: "Compare every store",
    body: "See live prices from every store in your market side by side — ranked by total delivered cost (item + postage), plus eBay.",
  },
  {
    n: 3,
    icon: "🛒",
    title: "Buy for the best price",
    body: "Click straight through to the cheapest shop. Free, independent, and no sign-up needed.",
  },
];

export function HowItWorks({ totalCards }: { totalCards: number }) {
  return (
    <section aria-labelledby="how-it-works-heading">
      <div className="mb-4">
        <h2 id="how-it-works-heading" className="text-xl font-extrabold text-white">
          How RiftCompare works
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Find the cheapest place to buy any of {totalCards.toLocaleString()} Riftbound cards in three steps — always free.
        </p>
      </div>

      <Reveal stagger className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="card-surface relative flex flex-col gap-2 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-lg" aria-hidden>
                {s.icon}
              </span>
              <span className="num text-sm font-bold text-brand-400">Step {s.n}</span>
            </div>
            <h3 className="text-base font-bold text-white">{s.title}</h3>
            <p className="text-sm leading-relaxed text-slate-400">{s.body}</p>
          </div>
        ))}
      </Reveal>

      <div className="mt-4">
        <Link href="/browse" className="btn-primary text-sm">
          Start comparing — browse the database →
        </Link>
      </div>
    </section>
  );
}
