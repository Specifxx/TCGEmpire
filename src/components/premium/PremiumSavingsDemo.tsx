"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import { DEMO_LINE_CAP, type DemoAnswer } from "@/lib/premium-page";
import { CtaZone } from "./PremiumPageClient";

// "Try it free" (2026-10-23, DECISIONS.md "/premium, rebuilt to convert,
// honestly"): paste up to DEMO_LINE_CAP cards, get the real Best Basket answer
// as totals — the cheapest one-store order against the cheapest delivered
// split. app/api/premium/demo runs lib/basket.ts read-only; the store-by-store
// plan and lists past the cap are Premium's. premium_demo_run carries counts
// only, never the list.

type Answer = DemoAnswer & { currency: string; lineCap: number };

export function PremiumSavingsDemo({ exampleNames }: { exampleNames: string[] }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/premium/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAnswer(null);
        setError(res.status === 429 ? "That's a lot of tries for one hour. Give it a few minutes." : d.error ?? "Couldn't price that list. Try again.");
        trackEvent("premium_demo_run", { ok: false, status: res.status });
        return;
      }
      setAnswer(d as Answer);
      trackEvent("premium_demo_run", { ok: true, covered: d.covered, requested: d.requested, saved: (d.savedCents ?? 0) > 0 });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const fmt = (c: number) => formatMoney(c, answer?.currency ?? "USD");
  const example = exampleNames.slice(0, 5).map((n) => `1 ${n}`).join("\n");

  return (
    <section aria-labelledby="premium-demo" className="mx-auto mt-10 max-w-2xl" data-premium-demo>
      <h2 id="premium-demo" className="text-center font-display text-xl font-extrabold text-white sm:text-2xl">
        Try it free: price a short list
      </h2>
      <p className="mt-1 text-center text-sm text-slate-400">
        Paste up to {DEMO_LINE_CAP} cards. We compare the cheapest single-store order with the cheapest delivered split, postage counted.
      </p>
      <div className="card-surface mt-4 rounded-2xl border border-ink-700 p-3 sm:p-4">
        <label htmlFor="premium-demo-list" className="text-xs font-semibold text-slate-300">
          Your list, one card per line (e.g. &ldquo;2 Card name&rdquo;)
        </label>
        <textarea
          id="premium-demo-list"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={4000}
          className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-sm text-white placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
          placeholder={"1 Card name\n2 Another card"}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={run} disabled={busy || !text.trim()} className="btn-primary min-h-11 px-4 text-sm disabled:opacity-60">
            {busy ? "Pricing…" : "Compare prices"}
          </button>
          {example && (
            <button type="button" onClick={() => setText(example)} className="btn-ghost min-h-11 px-3 text-xs">
              Use an example list
            </button>
          )}
        </div>
        {/* Reserved height: the answer replaces this box without moving the page. */}
        <div className="mt-3 min-h-[148px]" aria-live="polite">
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          {!error && !answer && <p className="text-xs text-slate-500">Your totals appear here. Nothing is saved.</p>}
          {answer && <DemoResult a={answer} fmt={fmt} />}
        </div>
      </div>
    </section>
  );
}

function DemoResult({ a, fmt }: { a: Answer; fmt: (c: number) => string }) {
  if (a.covered === 0) {
    return (
      <p className="text-sm text-slate-300">
        None of those are in stock at a store that posts to you right now
        {a.unmatched.length ? `, and we couldn't match: ${a.unmatched.join(", ")}` : ""}. Try a few other cards.
      </p>
    );
  }
  const saved = a.savedCents ?? 0;
  return (
    <div className="space-y-2" data-premium-demo-result>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cheapest single store</div>
          <div className="num mt-0.5 text-lg font-extrabold text-white">{a.singleStoreCents == null ? "No one store" : fmt(a.singleStoreCents)}</div>
          {a.singleStoreCents == null && <div className="text-[11px] text-slate-400">stocks the whole list</div>}
        </div>
        <div className="rounded-xl border border-up/40 bg-up/10 p-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Cheapest delivered</div>
          <div className="num mt-0.5 text-lg font-extrabold text-white">{fmt(a.splitCents)}</div>
          <div className="text-[11px] text-slate-300">
            across {a.splitStores} store{a.splitStores === 1 ? "" : "s"}, postage in
          </div>
        </div>
      </div>
      <p className="text-sm text-slate-200">
        {a.singleStoreCents == null
          ? "No single store has every card, so splitting the order is the only way to get all of them."
          : saved > 0
            ? <>Splitting saves <strong className="text-up">{fmt(saved)}</strong> on this list.</>
            : "One store is already the cheapest way to buy this list, and Best Basket says so."}{" "}
        {a.covered < a.requested && <span className="text-slate-400">({a.covered} of {a.requested} cards in stock.)</span>}
      </p>
      {a.unmatched.length > 0 && <p className="text-xs text-slate-400">Couldn&apos;t match: {a.unmatched.join(", ")}</p>}
      <CtaZone location="demo" className="rounded-xl border border-gold/30 bg-gold/[0.06] p-2.5 text-xs text-slate-300">
        <span className="font-bold text-gold">Pro:</span> the store-by-store order with every link, the best one- and two-store options, and lists up to 200 cards
        {a.skippedLines > 0 ? ` (${a.skippedLines} line${a.skippedLines === 1 ? "" : "s"} past the first ${a.lineCap} weren't priced here)` : ""}.{" "}
        <a href="#top-pricing" className="font-semibold text-brand-400 hover:underline">
          See Pro plans →
        </a>
      </CtaZone>
    </div>
  );
}
