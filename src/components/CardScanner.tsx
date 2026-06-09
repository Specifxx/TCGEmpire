"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { useQuickView } from "./QuickView";
import { useCountry } from "./CountryProvider";
import type { CardTileData } from "./CardTile";

type Phase = "idle" | "starting" | "live" | "scanning" | "results" | "denied" | "error";

// Clean raw OCR text into a search-friendly card-name guess: letters/digits/spaces
// only, collapse whitespace, drop tiny noise tokens.
function cleanOcr(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/[^A-Za-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l.replace(/[^A-Za-z]/g, "").length >= 3)
    // Longest lines first — the card name is usually the biggest readable text.
    .sort((a, b) => b.length - a.length)
    .slice(0, 4);
}

// From a cleaned line, produce progressively shorter query candidates so a noisy
// tail ("...Augment Zaun") still matches on the leading words.
function candidatesFrom(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const words = line.split(" ").filter(Boolean);
    for (let n = Math.min(words.length, 4); n >= 1; n--) {
      const q = words.slice(0, n).join(" ");
      if (q.length >= 3 && !out.includes(q)) out.push(q);
    }
  }
  return out.slice(0, 10);
}

export function CardScanner() {
  const { open: openQuickView } = useQuickView();
  const { fmt, price } = useCountry();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<CardTileData[]>([]);
  const [lastText, setLastText] = useState("");
  const [manual, setManual] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<any>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Tidy up camera + OCR worker on unmount.
  useEffect(() => {
    return () => {
      stopCamera();
      workerRef.current?.terminate?.().catch?.(() => {});
    };
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setStatus("This device/browser doesn't support camera access. Use the search box below instead.");
      return;
    }
    setPhase("starting");
    setStatus("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("live");
    } catch (e: any) {
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
        setPhase("denied");
      } else {
        setPhase("error");
        setStatus("Couldn't start the camera. You can still search by name below.");
      }
    }
  }, []);

  async function search(queries: string[]): Promise<CardTileData[]> {
    for (const q of queries) {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length) return data.results as CardTileData[];
      } catch {
        /* ignore and try the next candidate */
      }
    }
    return [];
  }

  const scan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setPhase("scanning");
    setStatus("Reading the card…");
    setResults([]);

    // Capture the guide strip (the card-name band): a wide, short region centred
    // in the frame. Cropping to the name area massively improves OCR accuracy.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cropW = Math.round(vw * 0.86);
    const cropH = Math.round(vh * 0.16);
    const cropX = Math.round((vw - cropW) / 2);
    const cropY = Math.round(vh * 0.16);

    // Upscale the crop ~2x for sharper glyphs.
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = cropW * scale;
    canvas.height = cropH * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    try {
      setStatus("Loading the scanner (first run downloads ~5 MB)…");
      if (!workerRef.current) {
        const { createWorker } = await import("tesseract.js");
        workerRef.current = await createWorker("eng");
      }
      setStatus("Reading the card…");
      const { data } = await workerRef.current.recognize(canvas);
      const text: string = data?.text ?? "";
      setLastText(text.trim());

      const lines = cleanOcr(text);
      const queries = candidatesFrom(lines);
      if (!queries.length) {
        setPhase("results");
        setStatus("Couldn't read the card name. Try again — fill the box with the card's title.");
        return;
      }
      const found = await search(queries);
      setResults(found);
      setPhase("results");
      setStatus(found.length ? "" : "No match found. Try again or search by name below.");
    } catch (e) {
      setPhase("results");
      setStatus("Scan failed. Try again, or search by name below.");
    }
  }, []);

  async function manualSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = manual.trim();
    if (q.length < 2) return;
    setStatus("Searching…");
    const found = await search([q]);
    setResults(found);
    setStatus(found.length ? "" : "No match found.");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-extrabold text-white">Card Scanner</h1>
          <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wide text-brand-300">Beta</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Point your camera at a Riftbound card&apos;s name and we&apos;ll find it in the database — with live prices.
        </p>
      </div>

      <div className="card-surface overflow-hidden">
        {/* Camera viewport */}
        <div className="relative aspect-[4/3] w-full bg-ink-950">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${phase === "live" || phase === "scanning" ? "" : "hidden"}`}
          />

          {/* Guide frame — line up the card NAME inside this box */}
          {(phase === "live" || phase === "scanning") && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-start">
              <div className="mt-[16%] h-[16%] w-[86%] rounded-lg border-2 border-brand-400/90 shadow-[0_0_0_2000px_rgba(0,0,0,0.35)]" />
              <span className="mt-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                Line up the card name in the box
              </span>
            </div>
          )}

          {/* Idle / permission / error states */}
          {phase !== "live" && phase !== "scanning" && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              {phase === "idle" && (
                <div>
                  <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-2xl">📷</div>
                  <button onClick={startCamera} className="btn-primary">Start camera</button>
                  <p className="mt-3 text-xs text-slate-500">We never upload your photos — scanning runs on your device.</p>
                </div>
              )}
              {phase === "starting" && <p className="text-sm text-slate-400">Starting camera…</p>}
              {phase === "denied" && (
                <div>
                  <p className="text-sm text-slate-300">Camera permission was blocked.</p>
                  <p className="mt-1 text-xs text-slate-500">Allow camera access in your browser settings, then try again — or search by name below.</p>
                  <button onClick={startCamera} className="btn-ghost mt-3 text-sm">Try again</button>
                </div>
              )}
              {phase === "error" && <p className="max-w-sm text-sm text-slate-300">{status}</p>}
              {phase === "results" && (
                <div>
                  <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-2xl">📷</div>
                  <button onClick={startCamera} className="btn-primary">Scan another card</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        {(phase === "live" || phase === "scanning") && (
          <div className="flex items-center justify-center gap-3 border-t border-ink-800 p-3">
            <button onClick={scan} disabled={phase === "scanning"} className="btn-primary min-w-40">
              {phase === "scanning" ? "Scanning…" : "Scan card"}
            </button>
            <button
              onClick={() => {
                stopCamera();
                setPhase("idle");
              }}
              className="btn-ghost text-sm"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Status line */}
      {status && phase !== "error" && <p className="mt-3 text-center text-sm text-slate-400">{status}</p>}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Matches</h2>
          <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
            {results.map((r) => (
              <li key={r.id}>
                <Link
                  href={cardHref(r)}
                  prefetch={false}
                  onClick={(e) => {
                    fetch(`/api/card/${r.slug ?? r.id}/view?source=scan`, { method: "POST", keepalive: true }).catch(() => {});
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    openQuickView(r);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-ink-800"
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
                  <div className="shrink-0 text-sm font-bold text-accent">{price(r) != null ? fmt(price(r)!) : "—"}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Manual fallback search */}
      <form onSubmit={manualSearch} className="mt-4">
        <label className="mb-1 block text-xs font-medium text-slate-500">Scanner struggling? Search by name</label>
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

      {/* Debug: what the OCR read (helps you tune during beta) */}
      {lastText && (
        <details className="mt-4 text-xs text-slate-600">
          <summary className="cursor-pointer">What the scanner read</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-ink-900 p-2 text-slate-500">{lastText}</pre>
        </details>
      )}
    </div>
  );
}
