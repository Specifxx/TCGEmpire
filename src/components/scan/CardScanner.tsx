"use client";

// The card scanner's browser half (DECISIONS.md 2026-11-19 "Card scanner beta"). The phone's own camera app takes
// the photo (<input capture>): no getUserMedia, so the site's camera=() Permissions-Policy stays as it is and iOS
// needs no permission prompt. The photo is shrunk to 1,024 px here, sent once to /api/scan/identify, and never
// stored. The result opens the ordinary quick view (prices, eBay and TCGplayer rows, Add to collection); a scan
// itself never calls eBay.
import { useEffect, useRef, useState } from "react";
import { CardTile, type CardTileData } from "@/components/CardTile";
import { useQuickView } from "@/components/QuickView";
import { useCountry } from "@/components/CountryProvider";
import { trackEvent } from "@/lib/analytics";

type Confidence = "high" | "medium" | "low" | "none";
interface ScanResult {
  reading: { name: string | null; setCode: string | null; collectorNumber: string | null; game: string | null; isTradingCard: boolean };
  confidence: Confidence;
  why: string;
  card: CardTileData | null;
  alternates: CardTileData[];
  ms: number;
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

const MAX_SIDE = 1024;

async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  let w: number, h: number, src: CanvasImageSource;
  if (bitmap) {
    w = bitmap.width; h = bitmap.height; src = bitmap;
  } else {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    w = img.naturalWidth; h = img.naturalHeight; src = img;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

const CONF_COPY: Record<Confidence, { label: string; tone: string }> = {
  high: { label: "Match", tone: "text-brand-300" },
  medium: { label: "Likely match: check the printing", tone: "text-gold" },
  low: { label: "Not sure: is this your card?", tone: "text-rose-300" },
  none: { label: "No match", tone: "text-rose-300" },
};

export function CardScanner() {
  const camRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Scanned[]>([]);
  const [busy, setBusy] = useState(false);
  const [tally, setTally] = useState<Record<string, number> | null>(null);
  const { open } = useQuickView();
  const { price, fmt } = useCountry();

  useEffect(() => {
    fetch("/api/scan/feedback").then((r) => (r.ok ? r.json() : null)).then((d) => d && setTally(d.tally)).catch(() => {});
  }, []);

  const update = (key: number, patch: Partial<Scanned>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function onFile(file: File | undefined) {
    if (!file) return;
    const key = Date.now();
    setBusy(true);
    try {
      const photo = await shrink(file);
      setItems((xs) => [{ key, photo, result: null, error: null, chosen: null, feedback: null, added: false }, ...xs]);
      const res = await fetch("/api/scan/identify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: photo.split(",")[1] }) });
      const data = await res.json().catch(() => ({}));
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
    <div className="mt-5">
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="btn-primary flex-1 py-3 text-base disabled:opacity-60">
          {busy ? "Reading the card…" : items.length ? "Scan another card" : "Take a photo"}
        </button>
        <button type="button" disabled={busy} onClick={() => pickRef.current?.click()} className="btn-ghost flex-1 py-3 text-sm disabled:opacity-60">
          Choose a photo
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-400">
        Tips: one card, front side up, the whole card in the frame, no strong glare on the name or the number at the bottom.
      </p>

      {items.length > 1 && total > 0 && (
        <p className="mt-4 text-sm text-ink-200">
          {items.length} cards scanned, worth about <span className="font-semibold text-white">{fmt(total)}</span> at today&apos;s lowest prices.
        </p>
      )}

      <ul className="mt-4 space-y-5">
        {items.map((it) => (
          <li key={it.key} className="card-surface p-3">
            <div className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.photo} alt="Your photo" className="h-28 w-20 flex-none rounded object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                {!it.result && !it.error && <p className="text-ink-300">Reading the card…</p>}
                {it.error && <p className="text-rose-300">{it.error}</p>}
                {it.result && (
                  <>
                    <p className={`font-semibold ${CONF_COPY[it.result.confidence].tone}`}>{CONF_COPY[it.result.confidence].label}</p>
                    <p className="mt-1 text-xs text-ink-400">
                      Read: {[it.result.reading.name, [it.result.reading.setCode, it.result.reading.collectorNumber].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "nothing legible"}
                      {" "}({(it.result.ms / 1000).toFixed(1)} s)
                    </p>
                    {!it.result.card && <p className="mt-1 text-xs text-ink-300">{it.result.why}. Try a sharper photo, or search for it by name.</p>}
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
                    <button type="button" className="text-left text-xs text-ink-300 underline" onClick={() => sendFeedback(it, "right")}>
                      Right card ✓
                    </button>
                  )}
                </div>
              </div>
            )}

            {it.result && (it.result.alternates.length > 0 || it.result.card) && (
              <details className="mt-3" open={it.result.confidence !== "high"}>
                <summary className="cursor-pointer text-sm text-ink-200">{it.result.confidence === "high" ? "Wrong card? Pick the right printing" : "Which one is yours? Tap to pick"}</summary>
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
                      <span className="block text-ink-400">{c.setCode} {c.collectorNumber}{c.isPromo ? " · Promo" : ""}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="mt-2 text-xs text-ink-300 underline" onClick={() => sendFeedback(it, "not-listed")}>
                  My card isn&apos;t here
                </button>
                {it.feedback === "not-listed" && (
                  <p className="mt-1 text-xs text-ink-300">
                    Thanks. <a className="underline" href={`/cards?q=${encodeURIComponent(it.result.reading.name ?? "")}`}>Search for it by name</a>.
                  </p>
                )}
              </details>
            )}
          </li>
        ))}
      </ul>

      {tally && Object.keys(tally).length > 0 && (
        <p className="mt-6 text-xs text-ink-400">
          Beta tally (all testers):{" "}
          {Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · ")}
        </p>
      )}
    </div>
  );
}
