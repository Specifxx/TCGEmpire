"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cardDisplayName } from "@/lib/card-name";
import { COUNTRIES, type Country } from "@/lib/country";
import { DHASH_W, DHASH_H, dHashFromGray, luma, hammingHex } from "@/lib/image-hash";
import { useQuickView } from "./QuickView";
import { useCountry } from "./CountryProvider";
import type { CardTileData } from "./CardTile";

type Phase = "region" | "idle" | "starting" | "live" | "scanning" | "results" | "denied" | "error";
type CardHash = { id: string; h: string };
const REGIONS: Country[] = ["AU", "NZ", "US", "UK"];
// Capture box inset (fraction of each side) — a big central frame the card fills.
const FRAME_INSET = 0.06;
const VISUAL_THRESHOLD = 26; // max Hamming distance to surface a visual candidate

export function CardScanner() {
  const { open: openQuickView } = useQuickView();
  const { country, setCountry, fmt, price } = useCountry();
  const [phase, setPhase] = useState<Phase>("region");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<CardTileData[]>([]);
  const [manual, setManual] = useState("");
  const [isFoil, setIsFoil] = useState(false);
  const [isPromo, setIsPromo] = useState(false);
  const [added, setAdded] = useState<Record<string, "saving" | "done" | "signin" | "error">>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<any>(null);
  const hashesRef = useRef<CardHash[] | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    stopCamera();
    workerRef.current?.terminate?.().catch?.(() => {});
  }, [stopCamera]);

  // Warm the visual-hash index up front.
  useEffect(() => {
    fetch("/api/scan/hashes")
      .then((r) => (r.ok ? r.json() : { hashes: [] }))
      .then((d) => { hashesRef.current = d.hashes ?? []; })
      .catch(() => { hashesRef.current = []; });
  }, []);

  async function ensureWorker() {
    if (workerRef.current) return workerRef.current;
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/* '," } as any);
    workerRef.current = worker;
    return worker;
  }

  async function addToCollection(cardId: string) {
    setAdded((s) => ({ ...s, [cardId]: "saving" }));
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, isFoil }),
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
      else { setPhase("error"); setStatus("Couldn't start the camera. You can still search by name below."); }
    }
  }, []);

  function chooseRegion(code: Country) {
    setCountry(code);
    startCamera();
  }

  // The capture box in native video pixels (object-cover aware).
  function captureRect(video: HTMLVideoElement) {
    const cw = video.clientWidth, ch = video.clientHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.max(cw / vw, ch / vh);
    const offX = (vw * scale - cw) / 2;
    const offY = (vh * scale - ch) / 2;
    const dx = FRAME_INSET * cw, dy = FRAME_INSET * ch;
    const dw = cw - 2 * dx, dh = ch - 2 * dy;
    return { sx: (dx + offX) / scale, sy: (dy + offY) / scale, sw: dw / scale, sh: dh / scale };
  }

  async function hydrate(ids: string[]): Promise<CardTileData[]> {
    if (!ids.length) return [];
    const d = await fetch(`/api/cards?ids=${ids.join(",")}`).then((r) => r.json()).catch(() => ({ cards: [] }));
    return (d.cards ?? []) as CardTileData[];
  }

  const scan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setPhase("scanning");
    setStatus("Reading the card…");
    setResults([]);

    const { sx, sy, sw, sh } = captureRect(video);

    // (a) OCR canvas — upscaled, grayscale + contrast.
    const oc = document.createElement("canvas");
    const ow = 1100, oh = Math.max(1, Math.round(ow * (sh / sw)));
    oc.width = ow; oc.height = oh;
    const octx = oc.getContext("2d", { willReadFrequently: true })!;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(video, sx, sy, sw, sh, 0, 0, ow, oh);
    const oimg = octx.getImageData(0, 0, ow, oh);
    for (let i = 0; i < oimg.data.length; i += 4) {
      let v = luma(oimg.data[i], oimg.data[i + 1], oimg.data[i + 2]);
      v = (v - 128) * 1.5 + 128;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      oimg.data[i] = oimg.data[i + 1] = oimg.data[i + 2] = v;
    }
    octx.putImageData(oimg, 0, 0);

    // (b) Visual hash of the whole capture (0° and 180° to allow upside-down).
    const hc = document.createElement("canvas");
    hc.width = DHASH_W; hc.height = DHASH_H;
    const hctx = hc.getContext("2d", { willReadFrequently: true })!;
    hctx.imageSmoothingEnabled = true;
    hctx.drawImage(video, sx, sy, sw, sh, 0, 0, DHASH_W, DHASH_H);
    const hd = hctx.getImageData(0, 0, DHASH_W, DHASH_H).data;
    const gray: number[] = [];
    for (let i = 0; i < hd.length; i += 4) gray.push(luma(hd[i], hd[i + 1], hd[i + 2]));
    const hashA = dHashFromGray(gray);
    const hashB = dHashFromGray([...gray].reverse());

    // Visual nearest neighbours.
    let visualIds: string[] = [];
    const idx = hashesRef.current ?? [];
    if (idx.length) {
      visualIds = idx
        .map((c) => ({ id: c.id, d: Math.min(hammingHex(hashA, c.h), hammingHex(hashB, c.h)) }))
        .filter((x) => x.d <= VISUAL_THRESHOLD)
        .sort((a, b) => a.d - b.d)
        .slice(0, 6)
        .map((x) => x.id);
    }

    // OCR text.
    let text = "";
    try {
      const worker = await ensureWorker();
      const { data } = await worker.recognize(oc);
      text = (data?.text ?? "").trim();
    } catch { /* fall back to visual only */ }

    // Ask the server to resolve the OCR text (set+number, else fuzzy name).
    let ocrCards: CardTileData[] = [];
    if (text) {
      try {
        const d = await fetch("/api/scan/identify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, country, isPromo }),
        }).then((r) => r.json());
        ocrCards = (d.cards ?? []) as CardTileData[];
        // A single number hit is an exact match → jump straight to its stores.
        if (d.via === "number" && ocrCards.length === 1) {
          setResults(ocrCards);
          setPhase("results");
          setStatus("");
          openQuickView(ocrCards[0]);
          stopCamera();
          return;
        }
      } catch { /* ignore */ }
    }

    // Merge OCR candidates + visual candidates (dedup, OCR first).
    const visualCards = await hydrate(visualIds.filter((id) => !ocrCards.some((c) => c.id === id)));
    let merged = [...ocrCards, ...visualCards];
    if (isPromo) merged = [...merged].sort((a, b) => Number(b.isPromo) - Number(a.isPromo));
    merged = merged.slice(0, 6);

    setResults(merged);
    setPhase("results");
    if (!merged.length) {
      setStatus("Couldn't identify the card. Fill the frame, reduce glare, keep it upright — or search by name below.");
    } else if (ocrCards.length) {
      setStatus("Closest matches — tap the right card for prices.");
    } else {
      setStatus("Best visual guesses — tap the right card for prices, or search by name below.");
    }
  }, [country, isPromo, openQuickView, stopCamera]);

  async function searchByName(e: React.FormEvent) {
    e.preventDefault();
    const q = manual.trim();
    if (q.length < 2) return;
    setStatus("Searching…");
    try {
      const d = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults((d.results ?? []) as CardTileData[]);
      setStatus(d.results?.length ? "" : "No match found.");
    } catch { setStatus("Search failed."); }
  }

  const regionInfo = COUNTRIES[country];
  const Toggle = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
    <button
      type="button"
      onClick={() => set(!on)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${on ? "bg-brand-500/25 text-brand-200 ring-1 ring-brand-400" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}
    >
      {on ? "✓ " : ""}{label}
    </button>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white">Card Scanner</h1>
            <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wide text-brand-300">Beta</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Point your camera at a Riftbound card — we match it visually and read its set &amp; number, then show the cheapest store.
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

      {phase === "region" && (
        <div className="card-surface p-6">
          <h2 className="text-center font-display text-lg font-bold text-white">Where are you shopping from?</h2>
          <p className="mx-auto mt-1 max-w-sm text-center text-sm text-slate-400">We&apos;ll show prices from this market when we find your card.</p>
          <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-3">
            {REGIONS.map((code) => {
              const c = COUNTRIES[code];
              return (
                <button key={code} onClick={() => chooseRegion(code)} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-3 text-left transition-colors hover:border-brand-500">
                  <span className="text-2xl leading-none">{c.flag}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{c.label}</span><span className="text-xs text-slate-500">{c.currency}</span></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {phase !== "region" && (
        <div className="card-surface overflow-hidden">
          <div className="relative aspect-[3/4] w-full bg-ink-950 sm:aspect-[4/3]">
            <video ref={videoRef} playsInline autoPlay muted className="h-full w-full object-cover" />

            {(phase === "live" || phase === "scanning") && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute rounded-xl border-2 border-brand-400 shadow-[0_0_0_2000px_rgba(0,0,0,0.4)]" style={{ inset: `${FRAME_INSET * 100}%` }} />
                <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white">
                  Fill the frame with the card · any orientation · keep it sharp
                </span>
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
            <div className="border-t border-ink-800 p-3">
              <div className="mb-2 flex items-center justify-center gap-2">
                <span className="text-[11px] text-slate-500">Hard to read?</span>
                <Toggle on={isFoil} set={setIsFoil} label="Foil" />
                <Toggle on={isPromo} set={setIsPromo} label="Promo" />
              </div>
              <div className="flex items-center justify-center gap-3">
                <button onClick={scan} disabled={phase === "scanning"} className="btn-primary min-w-40">
                  {phase === "scanning" ? "Reading…" : "Scan card"}
                </button>
                <button onClick={() => { stopCamera(); setPhase("idle"); }} className="btn-ghost text-sm">Stop</button>
              </div>
            </div>
          )}
        </div>
      )}

      {status && phase !== "error" && phase !== "region" && <p className="mt-3 text-center text-sm text-slate-400">{status}</p>}

      {results.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">{results.length === 1 ? "Match" : "Pick your card"}</h2>
          <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
            {results.map((r) => {
              const state = added[r.id];
              return (
                <li key={r.id} className="flex items-center gap-1 px-1 hover:bg-ink-800">
                  <button onClick={() => openQuickView(r)} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5 text-left">
                    <div className="h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-900">
                      {r.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imageThumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{cardDisplayName(r.name, r)}{isFoil ? " · Foil" : ""}</div>
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
                    <button onClick={() => addToCollection(r.id)} disabled={state === "saving" || state === "done"} title="Add to My Cards"
                      className={`mr-1 shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${state === "done" ? "bg-brand-500/20 text-brand-300" : "bg-ink-800 text-slate-200 hover:bg-ink-700"}`}>
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
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. Viktor, Machine Herald" className="input flex-1" autoComplete="off" />
          <button type="submit" className="btn-ghost">Search</button>
        </div>
      </form>
    </div>
  );
}
