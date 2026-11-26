"use client";

// The card scanner's browser half (DECISIONS.md 2026-11-19 "Card scanner beta" and "Card scanner v2"). The live
// viewfinder (Viewfinder.tsx) frames the card and captures it on its own; a photo from the phone's camera app or
// gallery still works below it. The capture is shrunk to 1,024 px, sent once to /api/scan/identify, and never stored.
// The result opens the ordinary quick view (stored prices, eBay and TCGplayer rows, Add to collection); a scan itself
// never calls eBay.
import { useCallback, useEffect, useRef, useState } from "react";
import { Viewfinder } from "@/components/scan/Viewfinder";
import { useMe } from "@/lib/use-me";
import { CardTile, type CardTileData } from "@/components/CardTile";
import { useQuickView } from "@/components/QuickView";
import { useCountry } from "@/components/CountryProvider";
import { trackEvent } from "@/lib/analytics";
import { shrinkPhoto as shrink } from "@/lib/scan/shrink";

type Confidence = "high" | "medium" | "low" | "none";
interface ScanResult {
  reading: { name: string | null; setCode: string | null; collectorNumber: string | null; game: string | null; isTradingCard: boolean };
  confidence: Confidence;
  why: string;
  card: CardTileData | null;
  alternates: CardTileData[];
  ms: number;
  remaining?: number | null;
}
interface Scanned {
  key: number;
  photo: string;
  result: ScanResult | null;
  error: string | null;
  chosen: CardTileData | null;
  feedback: "right" | "picked-other" | "not-listed" | null;
  added: boolean;
}

const CONF_COPY: Record<Confidence, { label: string; badge: string }> = {
  high: { label: "Match", badge: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30" },
  medium: { label: "Check the printing", badge: "bg-amber-400/15 text-amber-300 ring-amber-400/30" },
  low: { label: "Not sure", badge: "bg-rose-400/15 text-rose-300 ring-rose-400/30" },
  none: { label: "No match", badge: "bg-rose-400/15 text-rose-300 ring-rose-400/30" },
};

export function CardScanner() {
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Scanned[]>([]);
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const { user, loaded } = useMe();
  const { open } = useQuickView();
  const { price, fmt } = useCountry();

  useEffect(() => {
    fetch("/api/scan/feedback").then((r) => (r.ok ? r.json() : null)).then((d) => d && setTally(d.tally)).catch(() => {});
  }, []);

  const update = (key: number, patch: Partial<Scanned>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const scan = useCallback(async (photo: string) => {
    const key = Date.now();
    setBusy(true);
    setItems((xs) => [{ key, photo, result: null, error: null, chosen: null, feedback: null, added: false }, ...xs]);
    try {
      const res = await fetch("/api/scan/identify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: photo.split(",")[1] }) });
      const data = await res.json().catch(() => ({}));
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (!res.ok) {
        update(key, { error: data.error ?? "Something went wrong. Try again." });
        return;
      }
      const result = data as ScanResult;
      update(key, { result, chosen: result.card });
      trackEvent("card_scan", { confidence: result.confidence, card_id: result.card?.id ?? "" });
      if (result.card && result.confidence === "high") open(result.card);
    } catch {
      update(key, { error: "We couldn't read that photo. Try again." });
    } finally {
      setBusy(false);
    }
  }, [open]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      await scan(await shrink(file));
    } finally {
      if (camRef.current) camRef.current.value = "";
      if (pickRef.current) pickRef.current.value = "";
    }
  }

  function sendFeedback(item: Scanned, verdict: "right" | "picked-other" | "not-listed") {
    if (item.feedback || !item.result) return;
    update(item.key, { feedback: verdict });
    fetch("/api/scan/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verdict, confidence: item.result.confidence }) }).catch(() => {});
  }

  async function addToCollection(item: Scanned) {
    if (!item.chosen) return;
    sendFeedback(item, item.chosen.id === item.result?.card?.id ? "right" : "picked-other");
    const res = await fetch("/api/collection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: item.chosen.id }) });
    if (res.ok) update(item.key, { added: true });
    else open(item.chosen); // the quick view explains a sign-in or the free limit
  }

  const total = items.reduce((s, x) => {
    const p = x.chosen ? price(x.chosen) : null;
    return s + (typeof p === "number" ? p : 0);
  }, 0);

  return (
    <div className="mt-4">
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {loaded && !user ? (
        <div className="card-surface flex flex-col items-center gap-3 rounded-2xl p-6 text-center">
          <p className="text-base font-semibold text-white">Sign in to scan your cards</p>
          <p className="text-sm text-slate-300">It&apos;s free: 5 scans a day, and every card you scan can go straight into your collection.</p>
          <a href="/login?src=scan&next=%2Fscan" className="btn-primary rounded-full px-6 py-3 text-base">Sign in free</a>
        </div>
      ) : (
        <Viewfinder
          busy={busy}
          onCapture={scan}
          footnote={
            <>
              {remaining !== null && <span className="font-semibold text-slate-200">{remaining} free {remaining === 1 ? "scan" : "scans"} left today · </span>}
              No camera?{" "}
              <button type="button" disabled={busy} className="underline" onClick={() => camRef.current?.click()}>Take a photo</button>
              {" "}or{" "}
              <button type="button" disabled={busy} className="underline" onClick={() => pickRef.current?.click()}>choose one</button>
            </>
          }
        />
      )}

      {items.length > 1 && total > 0 && (
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-gradient-to-r from-brand-400/15 to-emerald-400/10 px-4 py-3 ring-1 ring-white/10">
          <span className="text-sm text-slate-200">{items.length} cards scanned</span>
          <span className="text-right text-sm text-slate-200">worth about <span className="text-lg font-bold text-white">{fmt(total)}</span></span>
        </div>
      )}

      <ul className="mt-4 space-y-4">
        {items.map((it) => (
          <li key={it.key} className="card-surface rounded-2xl p-3">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.photo} alt="Your photo" className="h-28 w-20 flex-none rounded-lg object-cover ring-1 ring-white/10" />
              <div className="min-w-0 flex-1 text-sm">
                {!it.result && !it.error && <p className="animate-pulse text-slate-300">Reading the card…</p>}
                {it.error && <p className="text-rose-300">{it.error}</p>}
                {it.result && (
                  <>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${CONF_COPY[it.result.confidence].badge}`}>{CONF_COPY[it.result.confidence].label}</span>
                    {it.chosen && <p className="mt-1.5 truncate text-base font-semibold text-white">{it.chosen.name}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Read: {[it.result.reading.name, [it.result.reading.setCode, it.result.reading.collectorNumber].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "nothing legible"}
                      {" "}({(it.result.ms / 1000).toFixed(1)} s)
                    </p>
                    {!it.result.card && <p className="mt-1 text-xs text-slate-300">{it.result.why}. Try a sharper photo, or search for it by name.</p>}
                  </>
                )}
              </div>
            </div>

            {it.chosen && (
              <div className="mt-3 grid grid-cols-[9rem_1fr] gap-3">
                <CardTile card={it.chosen} />
                <div className="flex flex-col gap-2">
                  <button type="button" className="btn-primary py-2 text-sm" onClick={() => { sendFeedback(it, it.chosen!.id === it.result?.card?.id ? "right" : "picked-other"); open(it.chosen!); }}>
                    See prices and buy
                  </button>
                  <button type="button" disabled={it.added} className="btn-ghost py-2 text-sm disabled:opacity-60" onClick={() => addToCollection(it)}>
                    {it.added ? "✓ In your collection" : "Add to my collection"}
                  </button>
                  {it.feedback === null && it.result?.card && (
                    <button type="button" className="text-left text-xs text-slate-300 underline" onClick={() => sendFeedback(it, "right")}>
                      Right card ✓
                    </button>
                  )}
                </div>
              </div>
            )}

            {it.result && (it.result.alternates.length > 0 || it.result.card) && (
              <details className="mt-3" open={it.result.confidence !== "high"}>
                <summary className="cursor-pointer text-sm text-slate-200">{it.result.confidence === "high" ? "Wrong card? Pick the right printing" : "Which one is yours? Tap to pick"}</summary>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {[it.result.card, ...it.result.alternates].filter((c): c is CardTileData => !!c).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { update(it.key, { chosen: c, added: false }); if (c.id !== it.result?.card?.id) sendFeedback(it, "picked-other"); }}
                      className={`rounded border p-1 text-left text-[11px] leading-tight ${it.chosen?.id === c.id ? "border-brand-400" : "border-ink-700"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.imageThumbUrl ?? c.imageUrl ?? ""} alt="" aria-hidden="true" className="aspect-[5/7] w-full rounded object-cover" loading="lazy" />
                      <span className="mt-1 block truncate text-white">{c.name}</span>
                      <span className="block text-slate-400">{c.setCode} {c.collectorNumber}{c.isPromo ? " · Promo" : ""}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="mt-2 text-xs text-slate-300 underline" onClick={() => sendFeedback(it, "not-listed")}>
                  My card isn&apos;t here
                </button>
                {it.feedback === "not-listed" && (
                  <p className="mt-1 text-xs text-slate-300">
                    Thanks. <a className="underline" href={`/cards?q=${encodeURIComponent(it.result.reading.name ?? "")}`}>Search for it by name</a>.
                  </p>
                )}
              </details>
            )}
          </li>
        ))}
      </ul>

      {tally && Object.keys(tally).length > 0 && (
        <p className="mt-6 text-xs text-slate-400">
          Beta tally (all testers):{" "}
          {Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
