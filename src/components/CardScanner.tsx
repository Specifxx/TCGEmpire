"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { DHASH_W, DHASH_H, dHashFromGray, luma, hammingHex } from "@/lib/image-hash";
import { useQuickView } from "./QuickView";
import { useCountry } from "./CountryProvider";
import type { CardTileData } from "./CardTile";

type Phase = "idle" | "starting" | "live" | "scanning" | "results" | "denied" | "error";
type CardHash = { id: string; h: string };

// Card aspect (standard TCG ~63×88mm). The guide outline and the capture crop both
// use this so what the user frames is exactly what we hash.
const CARD_AR_H_OVER_W = 88 / 63; // ≈ 1.397
// Guide box height as a fraction of the viewport height.
const GUIDE_H_FRAC = 0.82;
// Max Hamming distance (of 64 bits) we'll surface as a candidate.
const MATCH_THRESHOLD = 20;
const STRONG_MATCH = 12;

export function CardScanner() {
  const { open: openQuickView } = useQuickView();
  const { fmt, price } = useCountry();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<CardTileData[]>([]);
  const [bestDist, setBestDist] = useState<number | null>(null);
  const [manual, setManual] = useState("");
  const [added, setAdded] = useState<Record<string, "saving" | "done" | "signin" | "error">>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Card-image hashes, fetched once and reused for every scan.
  const hashesRef = useRef<CardHash[] | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Warm the hash index as soon as the page opens so the first scan is instant.
  useEffect(() => {
    fetch("/api/scan/hashes")
      .then((r) => (r.ok ? r.json() : { hashes: [] }))
      .then((d) => { hashesRef.current = d.hashes ?? []; })
      .catch(() => { hashesRef.current = []; });
  }, []);

  async function ensureHashes(): Promise<CardHash[]> {
    if (hashesRef.current) return hashesRef.current;
    const d = await fetch("/api/scan/hashes").then((r) => r.json()).catch(() => ({ hashes: [] }));
    hashesRef.current = d.hashes ?? [];
    return hashesRef.current!;
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

  // Hydrate matched card ids into full tile data (for prices + quick view).
  async function hydrate(ids: string[]): Promise<CardTileData[]> {
    if (!ids.length) return [];
    const d = await fetch(`/api/cards?ids=${ids.join(",")}`).then((r) => r.json()).catch(() => ({ cards: [] }));
    return (d.cards ?? []) as CardTileData[];
  }

  // Compute the dHash of the framed card region and find nearest cards.
  const scan = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setPhase("scanning");
    setStatus("Matching card…");
    setResults([]);
    setBestDist(null);

    // Map the on-screen guide box (centred, card-shaped) to the video's native
    // pixels, accounting for object-cover cropping, then crop exactly that region.
    const cw = video.clientWidth;
    const ch = video.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(cw / vw, ch / vh); // object-cover
    const offX = (vw * scale - cw) / 2;
    const offY = (vh * scale - ch) / 2;

    const gh = GUIDE_H_FRAC * ch;
    const gw = gh / CARD_AR_H_OVER_W;
    const gx = (cw - gw) / 2;
    const gy = (ch - gh) / 2;
    const sx = (gx + offX) / scale;
    const sy = (gy + offY) / scale;
    const sw = gw / scale;
    const sh = gh / scale;

    // Downscale the crop straight to the dHash grid (single step, mirroring the
    // server-side Jimp resize so the hashes are comparable).
    const canvas = document.createElement("canvas");
    canvas.width = DHASH_W;
    canvas.height = DHASH_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, DHASH_W, DHASH_H);
    const { data } = ctx.getImageData(0, 0, DHASH_W, DHASH_H);
    const gray: number[] = [];
    for (let i = 0; i < data.length; i += 4) gray.push(luma(data[i], data[i + 1], data[i + 2]));
    const hash = dHashFromGray(gray);

    const hashes = await ensureHashes();
    if (!hashes.length) {
      setPhase("results");
      setStatus("The scanner index isn't ready yet. Please try again shortly, or search by name below.");
      return;
    }

    // Nearest neighbours by Hamming distance.
    const ranked = hashes
      .map((c) => ({ id: c.id, d: hammingHex(hash, c.h) }))
      .sort((a, b) => a.d - b.d);
    const best = ranked[0]?.d ?? 64;
    setBestDist(best);

    const top = ranked.filter((r) => r.d <= MATCH_THRESHOLD).slice(0, 6);
    if (!top.length) {
      setPhase("results");
      setStatus("No confident match. Fill the frame with the whole card, avoid glare, and try again — or search by name below.");
      return;
    }
    const cards = await hydrate(top.map((t) => t.id));
    setResults(cards);
    setPhase("results");
    setStatus(best <= STRONG_MATCH ? "" : "Best guesses below — if none are right, reframe and rescan.");
  }, []);

  async function searchByName(e: React.FormEvent) {
    e.preventDefault();
    const q = manual.trim();
    if (q.length < 2) return;
    setStatus("Searching…");
    try {
      const d = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults((d.results ?? []) as CardTileData[]);
      setStatus(d.results?.length ? "" : "No match found.");
      setBestDist(null);
    } catch {
      setStatus("Search failed.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-extrabold text-white">Card Scanner</h1>
          <span className="chip bg-brand-500/15 text-[11px] font-bold uppercase tracking-wide text-brand-300">Beta</span>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Line a Riftbound card up inside the frame and we&apos;ll match it against the database by its artwork — with live prices.
        </p>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="relative aspect-[3/4] w-full bg-ink-950 sm:aspect-[4/3]">
          {/* Kept mounted & never display:none — iOS Safari refuses to attach/play a
              hidden <video>. Non-live states are covered by the opaque overlay below. */}
          <video ref={videoRef} playsInline autoPlay muted className="h-full w-full object-cover" />

          {/* Full-card guide outline — frame the WHOLE card inside it */}
          {(phase === "live" || phase === "scanning") && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div
                className="relative rounded-xl border-2 border-brand-400 shadow-[0_0_0_2000px_rgba(0,0,0,0.45)]"
                style={{ height: `${GUIDE_H_FRAC * 100}%`, aspectRatio: `63 / 88` }}
              >
                {/* corner ticks */}
                <span className="absolute -left-0.5 -top-0.5 h-5 w-5 rounded-tl-xl border-l-4 border-t-4 border-brand-300" />
                <span className="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-tr-xl border-r-4 border-t-4 border-brand-300" />
                <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-xl border-b-4 border-l-4 border-brand-300" />
                <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-xl border-b-4 border-r-4 border-brand-300" />
              </div>
              <span className="absolute bottom-3 rounded bg-black/65 px-2.5 py-1 text-xs font-medium text-white">
                Fit the whole card inside the frame
              </span>
            </div>
          )}

          {phase !== "live" && phase !== "scanning" && (
            <div className="absolute inset-0 grid place-items-center bg-ink-950 p-6 text-center">
              {phase === "idle" && (
                <div>
                  <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-2xl">📷</div>
                  <button onClick={startCamera} className="btn-primary">Start camera</button>
                  <p className="mt-3 text-xs text-slate-500">Matching runs on your device — your camera images never leave your phone.</p>
                </div>
              )}
              {phase === "starting" && <p className="text-sm text-slate-400">Starting camera…</p>}
              {phase === "denied" && (
                <div>
                  <p className="text-sm text-slate-300">Camera permission was blocked.</p>
                  <p className="mt-1 text-xs text-slate-500">Allow camera access for this site in your browser settings, then try again — or search by name below.</p>
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

        {(phase === "live" || phase === "scanning") && (
          <div className="flex items-center justify-center gap-3 border-t border-ink-800 p-3">
            <button onClick={scan} disabled={phase === "scanning"} className="btn-primary min-w-40">
              {phase === "scanning" ? "Matching…" : "Scan card"}
            </button>
            <button onClick={() => { stopCamera(); setPhase("idle"); }} className="btn-ghost text-sm">Stop</button>
          </div>
        )}
      </div>

      {status && phase !== "error" && <p className="mt-3 text-center text-sm text-slate-400">{status}</p>}

      {results.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">
            {bestDist != null && bestDist <= STRONG_MATCH ? "Match" : "Closest matches"}
          </h2>
          <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
            {results.map((r) => {
              const state = added[r.id];
              return (
                <li key={r.id} className="flex items-center gap-1 px-1 hover:bg-ink-800">
                  <Link
                    href={cardHref(r)}
                    prefetch={false}
                    onClick={(e) => {
                      fetch(`/api/card/${r.slug ?? r.id}/view?source=scan`, { method: "POST", keepalive: true }).catch(() => {});
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      openQuickView(r);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5"
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

      {/* Manual fallback search */}
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

      {bestDist != null && (
        <p className="mt-3 text-center text-[11px] text-slate-600">Match confidence: {Math.max(0, Math.round((1 - bestDist / 64) * 100))}%</p>
      )}
    </div>
  );
}
