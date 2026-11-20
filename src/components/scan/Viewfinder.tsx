"use client";

// The scanner's live viewfinder (DECISIONS.md 2026-11-19 "Card scanner v2: live viewfinder"). The camera opens only
// when the visitor taps Start (never on page load), only on /scan (next.config.js lets this one page ask for it), and
// stops when the page is hidden or left. About eight times a second a 180 px grey copy of the picture goes through
// lib/scan/frame.ts detectCard: the card is found wherever it is in view and outlined as it moves, with no lining up;
// once it holds still and sharp for half a second it is cropped (plus a little table) and captured. Only that capture
// leaves the phone (to /api/scan/identify, as before); the video itself is never recorded or sent.
import { useCallback, useEffect, useRef, useState } from "react";
import { DETECT_COPY, READY_FRAMES, detectCard, guideInVideo, guideRect, judgeDetection, motion, rectShift, scaleRect, sharpness, toGray, type DetectHint, type Rect } from "@/lib/scan/frame";

const ANALYSE_W = 180;
const TICK_MS = 120;
const OUT_MAX = 1024;
/** The capture keeps a little table around the card, so a card found a few pixels small is still whole. */
const CAPTURE_PAD = 0.08;

type CamState = "idle" | "starting" | "live" | "denied" | "unsupported";

interface Props {
  busy: boolean;
  onCapture: (jpegDataUrl: string) => void;
  /** Shown under the shutter: "3 free scans left today" and the like. */
  footnote?: React.ReactNode;
}

export function Viewfinder({ busy, onCapture, footnote }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevRef = useRef<Float32Array | null>(null);
  const readyRef = useRef(0);
  // After a capture, auto-capture waits until the card leaves the frame or is swapped (a big change in the picture), so
  // one card is read once and never eats a second free scan; the shutter button always takes another.
  const armedRef = useRef(true);
  const lastShotRef = useRef(0);
  const [cam, setCam] = useState<CamState>("idle");
  const [hintKey, setHintKey] = useState<DetectHint | null>(null);
  // the card found in the last frame, in the box's CSS pixels; smoothed so the outline glides rather than jumps
  const [found, setFound] = useState<Rect | null>(null);
  const foundRef = useRef<Rect | null>(null);
  const missRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [auto, setAuto] = useState(true);
  const [flash, setFlash] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    prevRef.current = null;
    readyRef.current = 0;
    foundRef.current = null;
    setFound(null);
    setTorch(null);
    setCam((c) => (c === "live" || c === "starting" ? "idle" : c));
  }, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCam("unsupported");
      return;
    }
    setCam("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorch(caps.torch ? false : null);
      armedRef.current = true;
      setCam("live");
      // Bring the whole viewfinder and its shutter above the phone's bottom bar.
      requestAnimationFrame(() => wrapRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    } catch (e) {
      const name = (e as { name?: string })?.name;
      setCam(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    const next = !torch;
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).then(() => setTorch(next)).catch(() => setTorch(null));
  }

  // Stop the camera when the tab is hidden or the page is left.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stop();
    };
  }, [stop]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !box.w) return;
    // the card that was found, or (shutter pressed with nothing found) the guide in the middle
    const g = foundRef.current ?? guideRect(box);
    const pad = { x: g.x - g.w * CAPTURE_PAD, y: g.y - g.h * CAPTURE_PAD, w: g.w * (1 + 2 * CAPTURE_PAD), h: g.h * (1 + 2 * CAPTURE_PAD) };
    const src = guideInVideo({ w: v.videoWidth, h: v.videoHeight }, box, pad);
    const sx = Math.max(0, src.x), sy = Math.max(0, src.y);
    const sw = Math.min(v.videoWidth - sx, src.w), sh = Math.min(v.videoHeight - sy, src.h);
    const k = Math.min(1, OUT_MAX / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    c.getContext("2d")!.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    lastShotRef.current = Date.now();
    armedRef.current = false;
    readyRef.current = 0;
    setProgress(0);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    navigator.vibrate?.(30);
    onCapture(c.toDataURL("image/jpeg", 0.85));
  }, [box, onCapture]);

  // The frame loop.
  useEffect(() => {
    if (cam !== "live" || !box.w) return;
    const canvas = document.createElement("canvas");
    const aw = ANALYSE_W;
    const ah = Math.round((ANALYSE_W * box.h) / box.w);
    canvas.width = aw;
    canvas.height = ah;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const toBox = box.w / aw;
    let lastDet: Rect | null = null;
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth || v.readyState < 2) return;
      const vis = guideInVideo({ w: v.videoWidth, h: v.videoHeight }, box, { x: 0, y: 0, w: box.w, h: box.h });
      ctx.drawImage(v, vis.x, vis.y, vis.w, vis.h, 0, 0, aw, ah);
      const g = toGray(ctx.getImageData(0, 0, aw, ah).data, aw, ah);
      const moved = motion(prevRef.current, g);
      prevRef.current = g;
      const det = detectCard(g, aw, ah);
      const shift = rectShift(lastDet, det?.rect ?? null);
      lastDet = det?.rect ?? null;
      const vd = judgeDetection(det, ah, det ? sharpness(g, aw, ah, det.rect) : 0, moved, shift);
      if (det) {
        missRef.current = 0;
        const r = scaleRect(det.rect, toBox);
        const p = foundRef.current;
        // glide: move most of the way each frame, snap when the card jumps
        const next = p && rectShift(p, r) < 0.15 ? { x: p.x + (r.x - p.x) * 0.6, y: p.y + (r.y - p.y) * 0.6, w: p.w + (r.w - p.w) * 0.6, h: p.h + (r.h - p.h) * 0.6 } : r;
        foundRef.current = next;
        setFound(next);
      } else if (++missRef.current > 3) {
        // keep the outline through a frame or two of glare, then let it go
        foundRef.current = null;
        setFound(null);
      }
      setHintKey(vd.hint);
      if (!armedRef.current && Date.now() - lastShotRef.current > 700 && (!det || moved > 25)) armedRef.current = true;
      if (vd.ready && armedRef.current) readyRef.current += 1;
      else readyRef.current = 0;
      setProgress(Math.min(1, readyRef.current / READY_FRAMES));
      if (auto && !busy && armedRef.current && readyRef.current >= READY_FRAMES) capture();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [cam, box, auto, busy, capture]);

  const guide = box.w ? guideRect(box) : null;
  // live: the outline follows the card that was found; nothing found yet: a faint guide shows where a card goes
  const outline = cam === "live" ? found : guide;
  const ready = hintKey === "ready";
  const hint = busy ? "Reading the card…" : cam !== "live" ? null : hintKey ? (ready && !armedRef.current ? "Next card" : DETECT_COPY[hintKey]) : "Starting…";

  return (
    <div ref={wrapRef} className="scroll-mb-24">
      <div ref={boxRef} className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-ink-950 ring-1 ring-white/10">
        <video ref={videoRef} playsInline muted autoPlay className={`absolute inset-0 h-full w-full object-cover ${cam === "live" ? "" : "opacity-0"}`} />

        {cam === "live" && !found && guide && (
          <div aria-hidden="true" className="pointer-events-none absolute rounded-[14px] border-2 border-dashed border-white/30" style={{ left: guide.x, top: guide.y, width: guide.w, height: guide.h }} />
        )}
        {outline && (
          <>
            {/* the dimmed surround with a card-shaped window that follows the card */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-[12px] transition-all duration-100 ease-out"
              style={{
                left: outline.x, top: outline.y, width: outline.w, height: outline.h,
                boxShadow: `0 0 0 9999px rgba(4,19,28,${cam === "live" ? 0.45 : 0.85}), 0 0 0 2px ${ready ? "rgba(52,211,153,0.9)" : "rgba(52,209,126,0.55)"}${ready ? ", 0 0 24px rgba(52,211,153,0.6)" : ""}`,
              }}
            />
            {/* corner brackets */}
            <svg aria-hidden="true" className="pointer-events-none absolute transition-all duration-100 ease-out" style={{ left: outline.x - 6, top: outline.y - 6, width: outline.w + 12, height: outline.h + 12 }} viewBox={`0 0 ${outline.w + 12} ${outline.h + 12}`}>
              {(() => {
                const W = outline.w + 12, H = outline.h + 12, L = Math.min(W, H) * 0.16, r = 12;
                const stroke = ready ? "#34d399" : "#34d17e";
                const d = [
                  `M3 ${L} V${r} Q3 3 ${r} 3 H${L}`,
                  `M${W - L} 3 H${W - r} Q${W - 3} 3 ${W - 3} ${r} V${L}`,
                  `M${W - 3} ${H - L} V${H - r} Q${W - 3} ${H - 3} ${W - r} ${H - 3} H${W - L}`,
                  `M${L} ${H - 3} H${r} Q3 ${H - 3} 3 ${H - r} V${H - L}`,
                ];
                return d.map((p, i) => <path key={i} d={p} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round" />);
              })()}
            </svg>
            {busy && (
              <div aria-hidden="true" className="pointer-events-none absolute overflow-hidden rounded-[12px]" style={{ left: outline.x, top: outline.y, width: outline.w, height: outline.h }}>
                <div className="scan-sweep absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-brand-400/40 to-transparent" />
              </div>
            )}
          </>
        )}

        {flash && <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/70" />}

        {hint && (
          <p role="status" aria-live="polite" className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink-950/80 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur">
            {hint}
          </p>
        )}

        {cam !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            {cam === "denied" ? (
              <p className="text-sm text-slate-200">The camera is blocked for this site. Allow it in your browser&apos;s site settings, or use a photo instead (below).</p>
            ) : cam === "unsupported" ? (
              <p className="text-sm text-slate-200">This browser can&apos;t show a live camera here. Use a photo instead (below).</p>
            ) : (
              <>
                <button type="button" onClick={start} disabled={cam === "starting"} className="btn-primary rounded-full px-6 py-3 text-base shadow-lg disabled:opacity-70">
                  {cam === "starting" ? "Opening the camera…" : "Start scanning"}
                </button>
                <p className="text-xs text-slate-300">Your camera stays on your phone. Only the snapshot of the card is read.</p>
              </>
            )}
          </div>
        )}

        {cam === "live" && torch !== null && (
          <button type="button" onClick={toggleTorch} aria-pressed={torch} className="absolute right-3 top-3 rounded-full bg-ink-950/80 px-3 py-1.5 text-xs font-semibold text-white">
            {torch ? "Light on" : "Light"}
          </button>
        )}
      </div>

      {cam === "live" && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setAuto((a) => !a)} aria-pressed={auto} className={`chip ${auto ? "text-white" : "text-slate-300"}`}>
            Auto {auto ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={busy}
            aria-label="Take the picture now"
            className="relative grid h-[72px] w-[72px] place-items-center rounded-full disabled:opacity-60"
            style={{ background: `conic-gradient(#34d399 ${progress * 360}deg, rgba(255,255,255,0.25) 0deg)` }}
          >
            <span className="h-[60px] w-[60px] rounded-full border-4 border-ink-950 bg-white" />
          </button>
          <button type="button" onClick={stop} className="chip text-slate-300">
            Stop
          </button>
        </div>
      )}
      {footnote && <div className="mt-3 text-center text-xs text-slate-400">{footnote}</div>}
    </div>
  );
}
