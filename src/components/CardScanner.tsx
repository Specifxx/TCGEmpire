"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { COUNTRIES, type Country } from "@/lib/country";
import { useQuickView } from "./QuickView";
import { useCountry } from "./CountryProvider";
import type { CardTileData } from "./CardTile";

type Phase = "region" | "idle" | "starting" | "live" | "scanning" | "results" | "denied" | "error";

// Card aspect (standard TCG ~63×88mm) for the guide outline & capture crop.
const CARD_AR_H_OVER_W = 88 / 63;
const GUIDE_H_FRAC = 0.82;
const REGIONS: Country[] = ["AU", "NZ", "US", "UK"];

export function CardScanner() {
  const { open: openQuickView } = useQuickView();
  const { country, setCountry, fmt, price } = useCountry();
  const [phase, setPhase] = useState<Phase>("region");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<CardTileData[]>([]);
  const [manual, setManual] = useState("");
  const [added, setAdded] = useState<Record<string, "saving" | "done" | "signin" | "error">>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<any>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      workerRef.current?.terminate?.().catch?.(() => {});
    };
  }, [stopCamera]);

  // Lazily create + warm the OCR worker (downloads once, then cached). Tuned to read
  // the small bottom-left set code + collector number only.
  async function ensureWorker() {
    if (workerRef.current) return workerRef.current;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/*",
      tessedit_pageseg_mode: "7", // PSM.SINGLE_LINE
    } as any);
    workerRef.current = worker;
    return worker;
  }

  async function addToCollection(cardId: string) {
    setAdded((s) => ({ ...s, [cardId]: "saving" }));
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (res.status === 401) return setAdded((s) => ({ ...s, [cardId]: "signin" }));
      if (!res.ok) return setAdded((s) => ({ ...s, [cardId]: "error" }));
      setAdded((s) => ({ ...s, [cardId]: "done" }));
    } catch {
      setAdded((s) => ({ ...s, [cardId]: "error" }));
    }
  }

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setStatus("This device/browser doesn't support camera access. Use the search box below instead.");
      return;
    }
    setPhase("starting");
    setStatus("");
    // Warm the OCR worker in the background so the first scan is fast.
    ensureWorker().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("live");
    } catch (e: any) {
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") setPhase("denied");
      else {
        setPhase("error");
        setStatus("Couldn't start the camera. You can still search by name below.");
      }
    }
  }, []);

  function chooseRegion(code: Country) {
    setCountry(code);
    startCamera();
  }

  // Map the on-screen guide box to native video pixels (object-cover aware) and
  // return the card region in video coordinates.
  function cardRegion(video: HTMLVideoElement) {
    const cw = video.clientWidth, ch = video.clientHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(cw / vw, ch / vh);
    const offX = (vw * scale - cw) / 2;
    const offY = (vh * scale - ch) / 2;
    const gh = GUIDE_H_FRAC * ch;
    const gw = gh / CARD_AR_H_OVER_W;
    const gx = (cw - gw) / 2;
    const gy = (ch - gh) / 2;
    return { gx, gy, gw, gh, scale, offX, offY };
  }

  const scan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setPhase("scanning");
    setStatus("Reading the card…");
    setResults([]);

    const { gx, gy, gw, gh, scale, offX, offY } = cardRegion(video);
    // Bottom-left identifier strip (set code + collector number) within the card.
    const subDX = gx + 0.015 * gw;
    const subDY = gy + 0.885 * gh;
    const subDW = 0.62 * gw;
    const subDH = 0.10 * gh;
    // → video pixels
    const sx = (subDX + offX) / scale;
    const sy = (subDY + offY) / scale;
    const sw = subDW / scale;
    const sh = subDH / scale;

    // Upscale the strip for sharper OCR.
    const targetW = 760;
    const targetH = Math.max(1, Math.round(targetW * (sh / sw)));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
    // Grayscale + contrast stretch to help the OCR on small text.
    const img = ctx.getImageData(0, 0, targetW, targetH);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      v = (v - 128) * 1.5 + 128; // contrast
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);

    let text = "";
    try {
      const worker = await ensureWorker();
      const { data } = await worker.recognize(canvas);
      text = (data?.text ?? "").trim();
    } catch {
      setPhase("results");
      setStatus("Scan failed — try again, or search by name below.");
      return;
    }

    try {
      const res = await fetch("/api/scan/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, country }),
      });
      const data = await res.json();
      const cards = (data.cards ?? []) as CardTileData[];
      setResults(cards);
      setPhase("results");
      if (cards.length === 1) {
        // One exact match → jump straight to the store comparison (cheapest first).
        setStatus("");
        openQuickView(cards[0]);
        stopCamera();
      } else if (cards.length > 1) {
        setStatus("A few prints match — pick the right one for prices.");
      } else {
        setStatus("Couldn't read the card's set & number. Fill the frame, keep the bottom-left sharp, and try again — or search by name below.");
      }
    } catch {
      setPhase("results");
      setStatus("Network error — try again.");
    }
  }, [country, openQuickView, stopCamera]);

  async function searchByName(e: React.FormEvent) {
    e.preventDefault();
    const q = manual.trim();
    if (q.length < 2) return;
    setStatus("Searching…");
    try {
      const d = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults((d.results ?? []) as CardTileData[]);
      setStatus(d.results?.length ? "" : "No match found.");
    } catch {
      setStatus("Search failed.");
    }
  }

  const regionInfo = COUNTRIES[country];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white">Card Scanner</h1>
            <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wide text-brand-300">Beta</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Scan a Riftbound card&apos;s bottom-left (set &amp; number) to identify it and see the cheapest store.
          </p>
        </div>
        {phase !== "region" && (
          <button
            onClick={() => { stopCamera(); setResults([]); setStatus(""); setPhase("region"); }}
            className="shrink-0 rounded-lg border border-ink-700 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-ink-800"
            title="Change region"
          >
            {regionInfo.flag} {country}
          </button>
        )}
      </div>

      {/* Step 1 — region (decides which market's prices you see) */}
      {phase === "region" && (
        <div className="card-surface p-6">
          <h2 className="text-center font-display text-lg font-bold text-white">Where are you shopping from?</h2>
          <p className="mx-auto mt-1 max-w-sm text-center text-sm text-slate-400">
            We&apos;ll show prices from this market when we find your card.
          </p>
          <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-3">
            {REGIONS.map((code) => {
              const c = COUNTRIES[code];
              return (
                <button
                  key={code}
                  onClick={() => chooseRegion(code)}
                  className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-3 text-left transition-colors hover:border-brand-500"
                >
                  <span className="text-2xl leading-none">{c.flag}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{c.label}</span>
                    <span className="text-xs text-slate-500">{c.currency}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2 — camera */}
      {phase !== "region" && (
        <div className="card-surface overflow-hidden">
          <div className="relative aspect-[3/4] w-full bg-ink-950 sm:aspect-[4/3]">
            <video ref={videoRef} playsInline autoPlay muted className="h-full w-full object-cover" />

            {(phase === "live" || phase === "scanning") && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div
                  className="relative rounded-xl border-2 border-brand-400 shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]"
                  style={{ height: `${GUIDE_H_FRAC * 100}%`, aspectRatio: `63 / 88` }}
                >
                  {/* bottom-left target where the set & number sit */}
                  <div className="absolute bottom-[2%] left-[1.5%] h-[10%] w-[62%] rounded border-2 border-dashed border-gold/90" />
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white">
                    Fit the whole card — keep the bottom-left sharp
                  </span>
                </div>
              </div>
            )}

            {phase !== "live" && phase !== "scanning" && (
              <div className="absolute inset-0 grid place-items-center bg-ink-950 p-6 text-center">
                {phase === "starting" && <p className="text-sm text-slate-400">Starting camera…</p>}
                {phase === "denied" && (
                  <div>
                    <p className="text-sm text-slate-300">Camera permission was blocked.</p>
                    <p className="mt-1 text-xs text-slate-500">Allow camera access for this site in your browser settings, then try again — or search by name below.</p>
                    <button onClick={startCamera} className="btn-ghost mt-3 text-sm">Try again</button>
                  </div>
                )}
                {phase === "error" && <p className="max-w-sm text-sm text-slate-300">{status}</p>}
                {(phase === "idle" || phase === "results") && (
                  <div>
                    <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-2xl">📷</div>
                    <button onClick={startCamera} className="btn-primary">{phase === "results" ? "Scan another card" : "Start camera"}</button>
                    <p className="mt-3 text-xs text-slate-500">Matching runs on your device — your camera images never leave your phone.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {(phase === "live" || phase === "scanning") && (
            <div className="flex items-center justify-center gap-3 border-t border-ink-800 p-3">
              <button onClick={scan} disabled={phase === "scanning"} className="btn-primary min-w-40">
                {phase === "scanning" ? "Reading…" : "Scan card"}
              </button>
              <button onClick={() => { stopCamera(); setPhase("idle"); }} className="btn-ghost text-sm">Stop</button>
            </div>
          )}
        </div>
      )}

      {status && phase !== "error" && phase !== "region" && <p className="mt-3 text-center text-sm text-slate-400">{status}</p>}

      {results.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">{results.length === 1 ? "Match" : "Pick your print"}</h2>
          <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
            {results.map((r) => {
              const state = added[r.id];
              return (
                <li key={r.id} className="flex items-center gap-1 px-1 hover:bg-ink-800">
                  <button
                    onClick={() => openQuickView(r)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left"
                  >
                    <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-900">
                      {r.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imageThumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{cardDisplayName(r.name, r)}</div>
                      <div className="text-xs text-slate-500">{r.setCode} · {r.collectorNumber}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-accent">{price(r) != null ? fmt(price(r)!) : "—"}</div>
                      <div className="text-[11px] text-brand-400">View stores →</div>
                    </div>
                  </button>
                  {state === "signin" ? (
                    <Link href="/login?next=/scan" className="btn-ghost mr-1 shrink-0 px-2 py-1 text-xs">Sign in</Link>
                  ) : (
                    <button
                      onClick={() => addToCollection(r.id)}
                      disabled={state === "saving" || state === "done"}
                      title="Add to My Cards"
                      className={`mr-1 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                        state === "done" ? "bg-brand-500/20 text-brand-300" : "bg-ink-800 text-slate-200 hover:bg-ink-700"
                      }`}
                    >
                      {state === "done" ? "✓ Added" : state === "saving" ? "…" : state === "error" ? "Retry" : "+ My Cards"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <form onSubmit={searchByName} className="mt-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">Can&apos;t get a match? Search by name</label>
        <div className="flex gap-2">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. Viktor, Machine Herald"
            className="input flex-1"
            autoComplete="off"
          />
          <button type="submit" className="btn-ghost">Search</button>
        </div>
      </form>
    </div>
  );
}
