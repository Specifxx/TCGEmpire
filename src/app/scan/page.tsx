import type { Metadata } from "next";
import { CardScanner } from "@/components/scan/CardScanner";

// The card scanner (DECISIONS.md 2026-11-19 "Card scanner beta" and "Card scanner v2"). A static shell: it reads no
// session, cookie or database; /api/scan/identify decides who may scan (everyone signed in, 5 a day free, unless
// SCAN_PUBLIC=0). Not indexed and in no sitemap: it is an app screen, not a page for search.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Scan a card",
  description: "Point your phone at a Riftbound card: we find the exact printing, its price today and where to buy it.",
  robots: { index: false, follow: false },
};

const STEPS = [
  { n: "1", title: "Point", text: "Hold one card anywhere in view, front up." },
  { n: "2", title: "Hold steady", text: "It finds the card, outlines it and snaps on its own." },
  { n: "3", title: "See the price", text: "The exact printing, today's prices, one tap to your collection." },
];

export default function ScanPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-4 sm:py-10">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-400/20 via-ink-900 to-emerald-400/10 px-5 py-4 ring-1 ring-white/10 sm:p-7">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-400">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> New · Beta
        </span>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight text-white sm:text-4xl">Scan a card</h1>
        <p className="mt-1 text-sm text-slate-200 sm:text-base">
          Point your phone at a Riftbound card: the exact printing, today&apos;s price and where to buy it, then one tap to your collection.
        </p>
      </div>
      <CardScanner />
      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-400">How it works</h2>
      <ol className="mt-3 grid grid-cols-3 gap-2">
        {STEPS.map((s) => (
          <li key={s.n} className="rounded-2xl bg-ink-900 p-3 ring-1 ring-white/5">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-400 text-xs font-bold text-ink-950">{s.n}</span>
            <p className="mt-2 text-sm font-semibold text-white">{s.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-300">{s.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-center text-[11px] text-slate-500">
        Free: 5 scans a day with a free account. Your photo is read once to find the card and is never stored.
      </p>
    </div>
  );
}
