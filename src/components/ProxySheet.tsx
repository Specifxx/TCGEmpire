"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

function decodeList(code: string): string {
  try {
    return decodeURIComponent(escape(atob(code)));
  } catch {
    return "";
  }
}

interface DeckItem {
  qty: number;
  name: string;
  card: { name: string; imageUrl: string | null; imageThumbUrl: string | null } | null;
}

export function ProxySheet({ initialList }: { initialList?: string }) {
  const text = initialList ? decodeList(initialList) : "";
  const [cards, setCards] = useState<{ img: string | null; name: string }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!text.trim()) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/deck/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        const out: { img: string | null; name: string }[] = [];
        const miss: string[] = [];
        for (const it of (data.items ?? []) as DeckItem[]) {
          const img = it.card?.imageUrl ?? it.card?.imageThumbUrl ?? null;
          if (!it.card || !img) miss.push(`${it.qty}× ${it.name}`);
          for (let i = 0; i < it.qty; i++) out.push({ img, name: it.card?.name ?? it.name });
        }
        setCards(out);
        setMissing(miss);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [text]);

  if (!text.trim()) {
    return (
      <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
        <div>
          <p className="text-lg font-semibold text-white">No deck to proxy</p>
          <p className="mt-1 text-sm">
            Open the <Link href="/deck" className="text-brand-400 hover:underline">Deck Builder</Link>,
            price a deck, then hit “Proxy sheet”.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Proxy sheet</h1>
          <p className="mt-1 text-sm text-slate-400">
            {loading ? "Building…" : `${cards.length} cards · 9 per A4 page · cards are real size (63×88 mm)`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/deck" className="btn-ghost">← Deck Builder</Link>
          <button onClick={() => window.print()} disabled={loading || !cards.length} className="btn-primary disabled:opacity-50">
            🖨 Print
          </button>
        </div>
      </div>

      <div className="no-print mb-4 rounded-lg border border-ink-700 bg-ink-900/60 p-3 text-xs text-slate-400">
        Tip: in the print dialog, set margins to <b>Default</b> and scale to <b>100%</b> (turn OFF “fit to page”)
        so the cards print at the correct size. Print on cardstock for sturdier proxies.
        {missing.length > 0 && (
          <div className="mt-2 text-gold">Couldn’t find an image for: {missing.join(", ")} (skipped).</div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
        </div>
      ) : (
        <div className="proxy-grid">
          {cards.map((c, i) =>
            c.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={i} className="proxy-card">
                <img src={c.img} alt={c.name} />
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}
