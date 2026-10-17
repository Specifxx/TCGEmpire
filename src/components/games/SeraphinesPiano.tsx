"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { earnArcade } from "@/lib/coins-client";
import {
  ENCORE_GAIN,
  ENCORE_SECONDS,
  HARMONY_GAIN,
  HARMONY_START,
  LANES,
  POINTS,
  SONGS,
  WINDOWS,
  accuracy,
  buildChart,
  grade,
  judge,
  multiplierFor,
  type Chart,
  type Judgement,
  type RunStats,
  type Song,
  type SongId,
} from "@/lib/seraphine-piano";
import { GameResultExtras, ResultPanel, useShare } from "./shared";
import { trackEvent } from "@/lib/analytics";

// SERAPHINE'S PIANO (2026-10-16). The rules live in lib/seraphine-piano.ts; this
// file draws and listens. Built for smoothness, which decides most of its shape:
//   - ONE clock: the Web Audio clock. Notes, judging and the backing track all
//     read AudioContext.currentTime, so the picture and the sound cannot drift,
//     and a hidden tab or a pause (ctx.suspend) simply stops time.
//   - ONE canvas, drawn in a requestAnimationFrame loop from refs. React renders
//     only when the PHASE changes (menu, playing, paused, results) or Encore
//     becomes ready, never per note, so a dense chart costs no React work.
//   - Note art is pre-rendered once per lane to an offscreen canvas, so a frame
//     is a handful of drawImage calls with no live shadow blur.
//   - Input is pointerdown (no click delay) and keydown, judged on the same clock.

const LANE_COLORS = ["#ff6fb1", "#5fd8ff", "#b18cff", "#ffd36b"];
const KEYS = ["d", "f", "j", "k"];
const ALT_KEYS = ["1", "2", "3", "4"];
const JUDGE_COLORS: Record<Judgement, string> = {
  perfect: "#ffe39a",
  great: "#7fe3ff",
  good: "#c9b1ff",
  miss: "#8a8fa3",
};
const JUDGE_LABEL: Record<Judgement, string> = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  miss: "MISS",
};

type Phase = "menu" | "playing" | "paused" | "results";
export interface PianoCardArt {
  slug: string;
  name: string;
  image: string | null;
}

// ── Sound ───────────────────────────────────────────────────────────────────────

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class PianoAudio {
  ctx: AudioContext;
  private out: GainNode;
  private wet: GainNode;
  private noise: AudioBuffer;
  constructor() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.out = this.ctx.createGain();
    this.out.gain.value = 0.85;
    this.out.connect(comp).connect(this.ctx.destination);
    // A soft hall: a decaying stereo noise impulse, mixed in under the dry signal.
    const len = Math.floor(this.ctx.sampleRate * 2.2);
    const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const verb = this.ctx.createConvolver();
    verb.buffer = ir;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.32;
    this.wet.connect(verb).connect(this.out);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  set muted(m: boolean) {
    this.out.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }
  private voice(dest: AudioNode) {
    const g = this.ctx.createGain();
    g.connect(dest);
    g.connect(this.wet);
    return g;
  }
  /** A bright, bell-edged piano note. */
  note(midi: number, when: number, vel = 0.5, bright = false) {
    const f = midiHz(midi);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(bright ? 6000 : 4200, when);
    lp.frequency.exponentialRampToValueAtTime(1400, when + 1.2);
    const g = this.voice(this.out);
    lp.connect(g);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vel, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, when + 1.5);
    const parts: [OscillatorType, number, number][] = [
      ["triangle", 1, 1],
      ["sine", 2, 0.28],
      ["sine", 3, 0.09],
      ["sine", 4.01, bright ? 0.06 : 0.025],
    ];
    for (const [type, mult, amp] of parts) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const og = this.ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(lp);
      o.start(when);
      o.stop(when + 1.6);
    }
  }
  /** A warm pad under each bar. */
  chord(midis: number[], when: number, dur: number) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 950;
    const g = this.voice(this.out);
    lp.connect(g);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.11, when + 0.35);
    g.gain.setValueAtTime(0.11, when + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, when + dur + 0.4);
    for (const m of midis) {
      for (const det of [-7, 7]) {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midiHz(m + 12);
        o.detune.value = det;
        const og = this.ctx.createGain();
        og.gain.value = 0.12;
        o.connect(og).connect(lp);
        o.start(when);
        o.stop(when + dur + 0.5);
      }
    }
  }
  kick(when: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(130, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.14);
    g.gain.setValueAtTime(0.42, when);
    g.gain.exponentialRampToValueAtTime(0.0008, when + 0.2);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.22);
  }
  hat(when: number, vol = 0.05) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 0.05);
    s.connect(hp).connect(g).connect(this.out);
    s.start(when);
    s.stop(when + 0.06);
  }
  miss(when: number) {
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(180, when);
    o.frequency.exponentialRampToValueAtTime(90, when + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, when);
    g.gain.exponentialRampToValueAtTime(0.0005, when + 0.18);
    o.connect(g).connect(this.out);
    o.start(when);
    o.stop(when + 0.2);
  }
  /** The Encore flourish: a quick rising arpeggio. */
  flourish(when: number) {
    [72, 76, 79, 84, 88].forEach((m, i) => this.note(m, when + i * 0.06, 0.3, true));
  }
}

// ── Drawing helpers ─────────────────────────────────────────────────────────────

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** One glowing note gem, rendered once per lane colour at device resolution. */
function noteSprite(color: string, w: number, h: number, dpr: number): HTMLCanvasElement {
  const pad = 14;
  const cv = document.createElement("canvas");
  cv.width = Math.ceil((w + pad * 2) * dpr);
  cv.height = Math.ceil((h + pad * 2) * dpr);
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);
  c.shadowColor = color;
  c.shadowBlur = 16;
  const g = c.createLinearGradient(0, pad, 0, pad + h);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.35, color);
  g.addColorStop(1, color);
  c.fillStyle = g;
  roundRect(c, pad, pad, w, h, h / 2);
  c.fill();
  c.shadowBlur = 0;
  c.globalAlpha = 0.85;
  c.fillStyle = "#ffffff";
  roundRect(c, pad + w * 0.18, pad + h * 0.18, w * 0.64, h * 0.22, h * 0.11);
  c.fill();
  return cv;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface FloatText {
  x: number;
  y: number;
  t0: number;
  label: string;
  color: string;
}
interface Ring {
  x: number;
  y: number;
  t0: number;
  color: string;
}

interface Run {
  song: Song;
  chart: Chart;
  startAt: number;
  latency: number;
  status: Uint8Array; // 0 pending, 1 hit, 2 missed
  missAt: Float32Array;
  firstPending: number;
  backingIdx: number;
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  harmony: number;
  encore: number;
  encoreUntil: number;
  encoreFlash: number;
  comboPop: number;
  pressAt: number[];
  held: boolean[];
  particles: Particle[];
  texts: FloatText[];
  rings: Ring[];
  ended: boolean;
}

const bestKey = (id: SongId) => `rc_piano_best_${id}`;
const readBest = (id: SongId) => {
  try {
    return parseInt(localStorage.getItem(bestKey(id)) || "0", 10) || 0;
  } catch {
    return 0;
  }
};

export function SeraphinesPiano({ art }: { art: Record<SongId, PianoCardArt | null> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<PianoAudio | null>(null);
  const runRef = useRef<Run | null>(null);
  const rafRef = useRef(0);
  const sizeRef = useRef({ w: 360, h: 560, dpr: 1 });
  const spritesRef = useRef<HTMLCanvasElement[]>([]);
  const goldSpriteRef = useRef<HTMLCanvasElement | null>(null);
  const reduceRef = useRef(false);
  const touchRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("menu");
  const [songId, setSongId] = useState<SongId>("starry");
  const [muted, setMuted] = useState(false);
  const [encoreReady, setEncoreReady] = useState(false);
  const [result, setResult] = useState<
    | (RunStats & {
        songId: SongId;
        acc: number;
        grade: string;
        best: number;
        isBest: boolean;
      })
    | null
  >(null);
  const [bests, setBests] = useState<Record<SongId, number>>({
    starry: 0,
    encore: 0,
    "not-alone": 0,
  });
  const phaseRef = useRef<Phase>("menu");
  phaseRef.current = phase;
  const { copied, share } = useShare();

  const charts = useMemo(() => Object.fromEntries(SONGS.map((s) => [s.id, buildChart(s)])) as Record<SongId, Chart>, []);

  useEffect(() => {
    setBests({
      starry: readBest("starry"),
      encore: readBest("encore"),
      "not-alone": readBest("not-alone"),
    });
    reduceRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    touchRef.current = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  }, []);

  // ── Layout ──
  const layout = useCallback(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const w = Math.max(280, Math.min(560, wrap.clientWidth));
    const h = Math.round(Math.max(440, Math.min(660, window.innerHeight * 0.74, w * 1.55)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    sizeRef.current = { w, h, dpr };
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const laneW = w / LANES;
    const nw = laneW * 0.66;
    const nh = Math.max(16, Math.min(28, laneW * 0.26));
    spritesRef.current = LANE_COLORS.map((c) => noteSprite(c, nw, nh, dpr));
    goldSpriteRef.current = noteSprite("#ffcf5a", nw, nh, dpr);
  }, []);

  useEffect(() => {
    layout();
    const ro = new ResizeObserver(() => layout());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [layout]);

  // ── Geometry ──
  const geo = () => {
    const { w, h } = sizeRef.current;
    const keyH = Math.max(62, Math.min(96, h * 0.15));
    const strikeY = h - keyH - 10;
    return { w, h, laneW: w / LANES, keyH, strikeY };
  };

  const songTime = (run: Run) => (audioRef.current ? audioRef.current.ctx.currentTime - run.startAt - run.latency : 0);

  // ── End of a run ──
  const finish = useCallback((cleared: boolean) => {
    const run = runRef.current;
    if (!run || run.ended) return;
    run.ended = true;
    cancelAnimationFrame(rafRef.current);
    const stats: RunStats = {
      ...run.counts,
      maxCombo: run.maxCombo,
      score: run.score,
      notes: run.chart.notes.length,
      cleared,
    };
    const acc = accuracy(stats);
    const prev = readBest(run.song.id);
    const isBest = run.score > prev;
    if (isBest) {
      try {
        localStorage.setItem(bestKey(run.song.id), String(run.score));
      } catch {
        /* storage full or blocked */
      }
    }
    setBests((b) => ({
      ...b,
      [run.song.id]: Math.max(b[run.song.id], run.score),
    }));
    setResult({
      ...stats,
      songId: run.song.id,
      acc,
      grade: grade(acc, cleared),
      best: Math.max(prev, run.score),
      isBest,
    });
    setEncoreReady(false);
    setPhase("results");
    earnArcade("seraphines-piano");
    trackEvent("game_complete", {
      game: "seraphines-piano",
      song: run.song.id,
      score: run.score,
      cleared,
    });
  }, []);

  // ── Effects ──
  const burst = (run: Run, lane: number, j: Judgement) => {
    const { laneW, strikeY } = geo();
    const x = laneW * lane + laneW / 2;
    const n = reduceRef.current ? 6 : j === "perfect" ? 22 : j === "great" ? 15 : 9;
    const color = run.encoreUntil > songTime(run) ? "#ffd36b" : LANE_COLORS[lane];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const sp = 140 + Math.random() * 260;
      const max = 0.45 + Math.random() * 0.45;
      if (run.particles.length > 260) run.particles.shift();
      run.particles.push({
        x,
        y: strikeY,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: max,
        max,
        color: Math.random() < 0.3 ? "#ffffff" : color,
        size: 1.5 + Math.random() * 2.5,
      });
    }
    run.rings.push({ x, y: strikeY, t0: performance.now(), color });
  };

  const say = (run: Run, lane: number, j: Judgement) => {
    const { laneW, strikeY } = geo();
    const x = laneW * lane + laneW / 2;
    // One label per lane: a new judgement replaces the last instead of stacking on it.
    run.texts = run.texts.filter((tx) => tx.x !== x);
    run.texts.push({
      x,
      y: strikeY - 34,
      t0: performance.now(),
      label: JUDGE_LABEL[j],
      color: JUDGE_COLORS[j],
    });
    if (run.texts.length > 8) run.texts.shift();
  };

  // ── Input ──
  const press = useCallback((lane: number) => {
    const run = runRef.current;
    const audio = audioRef.current;
    if (!run || !audio || run.ended || phaseRef.current !== "playing") return;
    run.pressAt[lane] = performance.now();
    const t = songTime(run);
    const notes = run.chart.notes;
    let best = -1;
    let bestD = Infinity;
    for (let i = run.firstPending; i < notes.length; i++) {
      const n = notes[i];
      if (n.t > t + WINDOWS.good) break;
      if (n.lane !== lane || run.status[i] !== 0) continue;
      const d = Math.abs(n.t - t);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const now = audio.ctx.currentTime;
    if (best < 0) {
      // A free tap: the key still sings, softly, and costs nothing.
      const pitch = [62, 67, 72, 76][lane];
      audio.note(pitch, now, 0.12);
      return;
    }
    const j = judge(notes[best].t - t) ?? "good";
    run.status[best] = 1;
    run.combo += 1;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    run.counts[j] += 1;
    const encoreOn = run.encoreUntil > t;
    run.score += POINTS[j] * multiplierFor(run.combo) * (encoreOn ? 2 : 1);
    run.harmony = Math.min(100, run.harmony + HARMONY_GAIN[j]);
    if (!encoreOn) {
      run.encore = Math.min(100, run.encore + ENCORE_GAIN[j]);
      if (run.encore >= 100) setEncoreReady(true);
    }
    run.comboPop = performance.now();
    audio.note(notes[best].midi, now, j === "perfect" ? 0.55 : j === "great" ? 0.45 : 0.32, j === "perfect" || encoreOn);
    burst(run, lane, j);
    say(run, lane, j);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const release = (lane: number) => {
    const run = runRef.current;
    if (run) run.held[lane] = false;
  };

  const fireEncore = useCallback(() => {
    const run = runRef.current;
    const audio = audioRef.current;
    if (!run || !audio || run.encore < 100 || phaseRef.current !== "playing") return;
    const t = songTime(run);
    run.encore = 0;
    run.encoreUntil = t + ENCORE_SECONDS;
    run.encoreFlash = performance.now();
    setEncoreReady(false);
    audio.flourish(audio.ctx.currentTime);
    trackEvent("piano_encore", { song: run.song.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    void audioRef.current?.ctx.suspend();
    setPhase("paused");
  }, []);
  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    void audioRef.current?.ctx.resume();
    setPhase("playing");
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phaseRef.current === "paused" && (e.key === "Escape" || e.key === " ")) {
        e.preventDefault();
        resume();
        return;
      }
      if (phaseRef.current !== "playing") return;
      const k = e.key.toLowerCase();
      const lane = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : ALT_KEYS.indexOf(k);
      if (lane >= 0) {
        e.preventDefault();
        if (e.repeat) return;
        const run = runRef.current;
        if (run) run.held[lane] = true;
        press(lane);
      } else if (k === " ") {
        e.preventDefault();
        fireEncore();
      } else if (k === "escape") {
        pause();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const lane = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : ALT_KEYS.indexOf(k);
      if (lane >= 0) release(lane);
    };
    const vis = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [press, fireEncore, pause, resume]);

  const laneFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(LANES - 1, Math.floor(((e.clientX - r.left) / r.width) * LANES)));
  };
  const pointerLanes = useRef(new Map<number, number>());
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "playing") return;
    e.preventDefault();
    const lane = laneFromEvent(e);
    pointerLanes.current.set(e.pointerId, lane);
    const run = runRef.current;
    if (run) run.held[lane] = true;
    press(lane);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const lane = pointerLanes.current.get(e.pointerId);
    if (lane != null) release(lane);
    pointerLanes.current.delete(e.pointerId);
  };

  // ── The frame ──
  const frame = useCallback(() => {
    rafRef.current = requestAnimationFrame(frame);
    const cv = canvasRef.current;
    const run = runRef.current;
    const audio = audioRef.current;
    if (!cv || !run || !audio) return;
    const c = cv.getContext("2d");
    if (!c) return;
    const { dpr } = sizeRef.current;
    const { w, h, laneW, keyH, strikeY } = geo();
    const t = songTime(run);
    const nowMs = performance.now();
    const speed = run.song.fallSpeed * h;
    const beat = run.chart.beat;

    // Schedule the backing a quarter-second ahead of the clock.
    if (!run.ended && phaseRef.current === "playing") {
      const bk = run.chart.backing;
      while (run.backingIdx < bk.length && bk[run.backingIdx].t <= t + 0.3) {
        const ev = bk[run.backingIdx++];
        const when = run.startAt + run.latency + ev.t;
        if (when < audio.ctx.currentTime - 0.01) continue;
        if (ev.kind === "chord") audio.chord(ev.midi ?? [], when, beat * 4);
        else if (ev.kind === "kick") audio.kick(when);
        else audio.hat(when);
      }
      // Notes that slid past the window are misses.
      const notes = run.chart.notes;
      for (let i = run.firstPending; i < notes.length; i++) {
        const n = notes[i];
        if (n.t > t - WINDOWS.good) break;
        if (run.status[i] === 0) {
          run.status[i] = 2;
          run.missAt[i] = t;
          run.combo = 0;
          run.counts.miss += 1;
          run.harmony = Math.max(0, run.harmony + HARMONY_GAIN.miss);
          audio.miss(audio.ctx.currentTime);
          say(run, n.lane, "miss");
        }
      }
      while (run.firstPending < notes.length && run.status[run.firstPending] !== 0 && notes[run.firstPending].t < t - 0.5) run.firstPending++;
      if (run.harmony <= 0) finish(false);
      else if (t > run.chart.duration) finish(true);
    }

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const encoreOn = run.encoreUntil > t;

    // Lanes.
    for (let l = 0; l < LANES; l++) {
      const x = l * laneW;
      const g = c.createLinearGradient(0, 0, 0, strikeY);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(1, `${LANE_COLORS[l]}24`);
      c.fillStyle = g;
      c.fillRect(x + 1, 0, laneW - 2, strikeY);
      const since = nowMs - run.pressAt[l];
      const glow = run.held[l] ? 1 : Math.max(0, 1 - since / 220);
      if (glow > 0) {
        const pg = c.createLinearGradient(0, strikeY - h * 0.55, 0, strikeY);
        pg.addColorStop(0, "rgba(255,255,255,0)");
        pg.addColorStop(
          1,
          `${LANE_COLORS[l]}${Math.round(glow * 110)
            .toString(16)
            .padStart(2, "0")}`,
        );
        c.fillStyle = pg;
        c.fillRect(x + 1, strikeY - h * 0.55, laneW - 2, h * 0.55);
      }
      if (l > 0) {
        c.fillStyle = "rgba(255,255,255,0.07)";
        c.fillRect(x, 0, 1, strikeY);
      }
    }
    if (encoreOn) {
      const pulse = 0.06 + 0.04 * Math.sin(nowMs / 120);
      c.fillStyle = `rgba(255,207,90,${pulse})`;
      c.fillRect(0, 0, w, strikeY);
    }

    // The strike line, breathing on the beat.
    const ph = t > 0 ? (t / beat) % 1 : 0;
    const pulse = 1 - ph * ph;
    const line = c.createLinearGradient(0, 0, w, 0);
    LANE_COLORS.forEach((col, i) => line.addColorStop(i / (LANES - 1), col));
    c.globalAlpha = 0.55 + 0.45 * pulse;
    c.fillStyle = line;
    c.fillRect(0, strikeY - 2, w, 4);
    c.globalAlpha = 0.18 + 0.2 * pulse;
    c.fillRect(0, strikeY - 10, w, 20);
    c.globalAlpha = 1;

    // Notes.
    const sprites = encoreOn && goldSpriteRef.current ? null : spritesRef.current;
    const sw = (spritesRef.current[0]?.width ?? 0) / dpr;
    const sh = (spritesRef.current[0]?.height ?? 0) / dpr;
    const notes = run.chart.notes;
    const horizon = t + (strikeY + 40) / speed;
    for (let i = Math.max(0, run.firstPending - 4); i < notes.length; i++) {
      const n = notes[i];
      if (n.t > horizon) break;
      const st = run.status[i];
      if (st === 1) continue;
      let y = strikeY - (n.t - t) * speed;
      let alpha = 1;
      if (st === 2) {
        const since = t - run.missAt[i];
        if (since > 0.35) continue;
        alpha = 1 - since / 0.35;
        y += since * 60;
      }
      const img = sprites ? sprites[n.lane] : goldSpriteRef.current!;
      if (!img) continue;
      c.globalAlpha = alpha;
      c.drawImage(img, n.lane * laneW + laneW / 2 - sw / 2, y - sh / 2, sw, sh);
    }
    c.globalAlpha = 1;

    // Rings and particles (additive light).
    c.globalCompositeOperation = "lighter";
    run.rings = run.rings.filter((r) => nowMs - r.t0 < 380);
    for (const r of run.rings) {
      const k = (nowMs - r.t0) / 380;
      c.globalAlpha = 1 - k;
      c.strokeStyle = r.color;
      c.lineWidth = 3 * (1 - k) + 0.5;
      c.beginPath();
      c.arc(r.x, r.y, 10 + k * laneW * 0.55, 0, Math.PI * 2);
      c.stroke();
    }
    const dt = 1 / 60;
    for (const p of run.particles) {
      p.life -= dt;
      p.vy += 520 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      c.globalAlpha = Math.max(0, p.life / p.max);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
    }
    run.particles = run.particles.filter((p) => p.life > 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;

    // The piano.
    for (let l = 0; l < LANES; l++) {
      const down = run.held[l] || nowMs - run.pressAt[l] < 90;
      const x = l * laneW + 4;
      const y = strikeY + 8 + (down ? 3 : 0);
      const kw = laneW - 8;
      const kh = keyH - 4;
      const kg = c.createLinearGradient(0, y, 0, y + kh);
      kg.addColorStop(0, down ? "#ffffff" : "rgba(255,255,255,0.92)");
      kg.addColorStop(1, LANE_COLORS[l]);
      if (down) {
        c.shadowColor = LANE_COLORS[l];
        c.shadowBlur = 22;
      }
      c.fillStyle = kg;
      roundRect(c, x, y, kw, kh, 12);
      c.fill();
      c.shadowBlur = 0;
      c.fillStyle = "rgba(255,255,255,0.55)";
      roundRect(c, x + 6, y + 5, kw - 12, 6, 3);
      c.fill();
      if (!touchRef.current) {
        c.fillStyle = "rgba(20,10,40,0.55)";
        c.font = "700 13px Inter, system-ui, sans-serif";
        c.textAlign = "center";
        c.fillText(KEYS[l].toUpperCase(), x + kw / 2, y + kh - 12);
      }
    }

    // Judgement words.
    c.textAlign = "center";
    run.texts = run.texts.filter((tx) => nowMs - tx.t0 < 600);
    for (const tx of run.texts) {
      const k = (nowMs - tx.t0) / 600;
      const s = 1 + 0.25 * Math.max(0, 1 - k * 5);
      c.globalAlpha = 1 - k;
      c.fillStyle = tx.color;
      c.font = `900 ${Math.round(14 * s)}px Inter, system-ui, sans-serif`;
      c.fillText(tx.label, tx.x, tx.y - k * 30);
    }
    c.globalAlpha = 1;

    // HUD: progress, harmony, encore, score, combo.
    const prog = Math.max(0, Math.min(1, t / run.chart.duration));
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(0, 0, w, 3);
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, w * prog, 3);
    const barW = Math.min(180, w * 0.42);
    const hx = w - barW - 12;
    c.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(c, hx, 14, barW, 7, 4);
    c.fill();
    const hg = c.createLinearGradient(hx, 0, hx + barW, 0);
    hg.addColorStop(0, "#ff6fb1");
    hg.addColorStop(1, "#ffc3e1");
    c.fillStyle = run.harmony < 30 ? "#ff5a7a" : hg;
    roundRect(c, hx, 14, Math.max(7, (barW * run.harmony) / 100), 7, 4);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(c, hx, 27, barW, 5, 3);
    c.fill();
    c.fillStyle = encoreOn ? "#fff1b8" : "#ffd36b";
    const ev = encoreOn ? Math.max(0, (run.encoreUntil - t) / ENCORE_SECONDS) : run.encore / 100;
    if (ev > 0) {
      roundRect(c, hx, 27, Math.max(5, barW * ev), 5, 3);
      c.fill();
    }
    c.font = "700 9px Inter, system-ui, sans-serif";
    c.textAlign = "right";
    c.fillStyle = "rgba(255,255,255,0.6)";
    c.fillText("HARMONY", hx - 6, 21);
    c.fillStyle = run.encore >= 100 && !encoreOn ? "#ffd36b" : "rgba(255,255,255,0.6)";
    c.fillText(encoreOn ? "ENCORE ×2" : run.encore >= 100 ? "ENCORE READY" : "ENCORE", hx - 6, 33);

    c.textAlign = "left";
    c.fillStyle = "#ffffff";
    c.font = "800 22px Inter, system-ui, sans-serif";
    c.fillText(run.score.toLocaleString("en-US"), 12, 32);
    const mult = multiplierFor(run.combo) * (encoreOn ? 2 : 1);
    if (mult > 1) {
      c.font = "800 12px Inter, system-ui, sans-serif";
      c.fillStyle = encoreOn ? "#ffd36b" : "#ff9fcb";
      c.fillText(`×${mult}`, 12, 50);
    }
    if (run.combo >= 5) {
      const k = Math.min(1, (nowMs - run.comboPop) / 160);
      const s = 1 + 0.18 * (1 - k);
      c.textAlign = "center";
      c.globalAlpha = 0.9;
      c.fillStyle = "#ffffff";
      c.font = `900 ${Math.round(30 * s)}px Inter, system-ui, sans-serif`;
      c.fillText(String(run.combo), w / 2, h * 0.3);
      c.font = "800 10px Inter, system-ui, sans-serif";
      c.fillStyle = "rgba(255,255,255,0.65)";
      c.fillText("COMBO", w / 2, h * 0.3 + 16);
      c.globalAlpha = 1;
    }

    // Lead-in and Encore banners.
    const first = notes[0]?.t ?? 0;
    if (t < first - 0.4) {
      const left = first - 0.4 - t;
      c.textAlign = "center";
      c.fillStyle = "#ffffff";
      c.globalAlpha = Math.min(1, left);
      c.font = "900 30px Inter, system-ui, sans-serif";
      c.fillText(left > 2 ? run.song.title : left > 1 ? "Ready" : "Play!", w / 2, h * 0.42);
      c.globalAlpha = 1;
    }
    const sinceFlash = nowMs - run.encoreFlash;
    if (sinceFlash < 900) {
      const k = sinceFlash / 900;
      c.globalAlpha = 1 - k;
      c.fillStyle = "rgba(255,230,160,0.22)";
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1 - k;
      c.fillStyle = "#ffe39a";
      c.textAlign = "center";
      c.font = `900 ${Math.round(34 + k * 10)}px Inter, system-ui, sans-serif`;
      c.fillText("ENCORE!", w / 2, h * 0.22);
      c.globalAlpha = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Start ──
  const start = useCallback(
    async (id: SongId) => {
      let audio = audioRef.current;
      if (!audio) {
        try {
          audio = new PianoAudio();
          audioRef.current = audio;
        } catch {
          return;
        }
      }
      audio.muted = muted;
      await audio.ctx.resume().catch(() => {});
      const song = SONGS.find((s) => s.id === id)!;
      const chart = charts[id];
      const ctx = audio.ctx;
      const latency = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? ctx.baseLatency ?? 0;
      runRef.current = {
        song,
        chart,
        startAt: ctx.currentTime + 1.2,
        latency: Math.min(0.12, Math.max(0, latency)),
        status: new Uint8Array(chart.notes.length),
        missAt: new Float32Array(chart.notes.length),
        firstPending: 0,
        backingIdx: 0,
        score: 0,
        combo: 0,
        maxCombo: 0,
        counts: { perfect: 0, great: 0, good: 0, miss: 0 },
        harmony: HARMONY_START,
        encore: 0,
        encoreUntil: -1,
        encoreFlash: -1e9,
        comboPop: 0,
        pressAt: [-1e9, -1e9, -1e9, -1e9],
        held: [false, false, false, false],
        particles: [],
        texts: [],
        rings: [],
        ended: false,
      };
      setSongId(id);
      setResult(null);
      setEncoreReady(false);
      setPhase("playing");
      layout();
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(frame);
      trackEvent("game_start", { game: "seraphines-piano", song: id });
      wrapRef.current?.scrollIntoView({
        block: "nearest",
        behavior: reduceRef.current ? "auto" : "smooth",
      });
    },
    [charts, frame, layout, muted],
  );

  const quit = () => {
    const run = runRef.current;
    if (run) run.ended = true;
    cancelAnimationFrame(rafRef.current);
    void audioRef.current?.ctx.resume();
    setPhase("menu");
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const song = SONGS.find((s) => s.id === songId)!;
  const playing = phase === "playing" || phase === "paused";

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0620] shadow-[0_20px_60px_-20px_rgba(255,111,177,0.45)]"
      >
        {/* The stage behind the canvas: night sky, Seraphine's art, twinkling stars. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#3a0f52_0%,#170a2e_45%,#08051a_100%)]" />
        {art[songId]?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            aria-hidden="true"
            src={art[songId]!.image!}
            alt=""
            className="sp-drift pointer-events-none absolute -top-10 left-1/2 w-[120%] max-w-none -translate-x-1/2 opacity-[0.18] blur-[2px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]"
          />
        )}
        <div aria-hidden className="sp-stars pointer-events-none absolute inset-0" />

        <canvas
          ref={canvasRef}
          className={`relative block touch-none select-none ${playing ? "" : "pointer-events-none opacity-0"}`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
          aria-label="Seraphine's Piano: tap the lanes as notes reach the line"
        />

        {playing && (
          <div className="absolute bottom-[calc(15%+18px)] left-0 right-0 flex justify-center">
            {encoreReady && phase === "playing" && (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  fireEncore();
                }}
                className="sp-encore pointer-events-auto rounded-full bg-gradient-to-r from-[#ffcf5a] via-[#fff1b8] to-[#ffcf5a] px-6 py-2.5 text-sm font-black tracking-wide text-[#3a2300] shadow-[0_0_30px_rgba(255,207,90,0.7)]"
              >
                ✦ ENCORE <span className="font-semibold opacity-70">(Space)</span>
              </button>
            )}
          </div>
        )}

        {playing && (
          <div className="absolute left-3 top-[58px] flex gap-1.5">
            <button
              type="button"
              onClick={phase === "paused" ? resume : pause}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur hover:bg-white/20"
              aria-label={phase === "paused" ? "Resume" : "Pause"}
            >
              {phase === "paused" ? "▶" : "❚❚"}
            </button>
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur hover:bg-white/20"
              aria-label={muted ? "Sound on" : "Sound off"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        )}

        {phase === "paused" && (
          <div className="absolute inset-0 grid place-items-center bg-[#08051a]/70 backdrop-blur-sm">
            <div className="text-center">
              <p className="font-display text-3xl font-extrabold text-white">Paused</p>
              <p className="mt-1 text-sm text-slate-300">{song.title}</p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={resume}
                  className="rounded-full bg-gradient-to-r from-[#ff6fb1] to-[#b18cff] px-6 py-2.5 text-sm font-extrabold text-white shadow-lg"
                >
                  Resume
                </button>
                <button type="button" onClick={quit} className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20">
                  Quit
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "menu" && (
          <div className="absolute inset-0 flex flex-col overflow-y-auto p-4 sm:p-6">
            <div className="m-auto w-full">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-[#ff9fcb]">Choose a song</p>
              <div className="mt-4 space-y-3">
                {SONGS.map((s, i) => {
                  const a = art[s.id];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void start(s.id)}
                      style={{ animationDelay: `${i * 90}ms` }}
                      className="sp-rise group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-left backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] active:translate-y-0"
                    >
                      <span className="relative h-[84px] w-[60px] shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
                        {a?.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.image}
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-display text-lg font-extrabold text-white">{s.title}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              s.difficulty === "Easy"
                                ? "bg-[#5fd8ff]/15 text-[#7fe3ff]"
                                : s.difficulty === "Normal"
                                  ? "bg-[#b18cff]/15 text-[#c9b1ff]"
                                  : "bg-[#ff6fb1]/15 text-[#ff9fcb]"
                            }`}
                          >
                            {s.difficulty}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-snug text-slate-300">{s.blurb}</span>
                        <span className="mt-1 block text-[11px] text-slate-500">
                          {s.bpm} BPM · {charts[s.id].notes.length} notes
                          {bests[s.id] ? ` · best ${bests[s.id].toLocaleString("en-US")}` : ""}
                        </span>
                      </span>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ff6fb1] to-[#b18cff] text-white shadow-[0_0_18px_rgba(255,111,177,0.5)] transition-transform group-hover:scale-110">
                        ▶
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-400">
                <span>
                  Tap the lanes, or press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-white">D</kbd>{" "}
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-white">F</kbd>{" "}
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-white">J</kbd>{" "}
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-bold text-white">K</kbd>
                </span>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="rounded-full bg-white/10 px-3 py-1 font-semibold text-white hover:bg-white/20"
                >
                  {muted ? "🔇 Sound off" : "🔊 Sound on"}
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "results" && result && (
          <div className="absolute inset-0 overflow-y-auto p-5 sm:p-7">
            <ResultPanel className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#ff9fcb]">{SONGS.find((s) => s.id === result.songId)!.title}</p>
              <p className={`sp-pop mt-2 font-display text-7xl font-black ${result.grade === "S" ? "sp-shine" : "text-white"}`}>{result.grade}</p>
              <p className="mt-1 text-sm text-slate-300">
                {result.cleared ? (result.grade === "S" ? "A standing ovation." : "Encore! Encore!") : "The crowd went quiet. Try again?"}
              </p>
              <p className="mt-4 text-4xl font-extrabold tabular-nums text-white">{result.score.toLocaleString("en-US")}</p>
              {result.isBest && <p className="mt-1 text-xs font-bold text-[#ffd36b]">✦ New best for this song</p>}
              <div className="mx-auto mt-4 grid max-w-xs grid-cols-4 gap-2 text-center">
                {(["perfect", "great", "good", "miss"] as const).map((k) => (
                  <div key={k} className="rounded-xl bg-white/[0.06] px-1 py-2">
                    <div className="text-lg font-extrabold tabular-nums" style={{ color: JUDGE_COLORS[k] }}>
                      {result[k]}
                    </div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{JUDGE_LABEL[k]}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                {Math.round(result.acc * 100)}% accuracy · max combo {result.maxCombo}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void start(result.songId)}
                  className="rounded-full bg-gradient-to-r from-[#ff6fb1] to-[#b18cff] px-6 py-2.5 text-sm font-extrabold text-white shadow-[0_0_20px_rgba(255,111,177,0.45)] transition-transform hover:scale-105"
                >
                  Play again
                </button>
                <button
                  type="button"
                  onClick={() => setPhase("menu")}
                  className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20"
                >
                  Choose a song
                </button>
                <button
                  type="button"
                  onClick={() =>
                    share(
                      `I scored ${result.score.toLocaleString("en-US")} (${result.grade}) on ${SONGS.find((s) => s.id === result.songId)!.title} in Seraphine's Piano 🎹✨ https://riftcompare.com/games/seraphines-piano`,
                    )
                  }
                  className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20"
                >
                  {copied ? "Copied!" : "Share"}
                </button>
              </div>
              <div className="text-left [&_.card-surface]:bg-white/[0.06]">
                <GameResultExtras game="seraphines-piano" score={result.score} />
              </div>
              {art[result.songId] && (
                <p className="mt-4 text-xs text-slate-400">
                  This song is named for{" "}
                  <Link href={`/card/${art[result.songId]!.slug}`} className="font-semibold text-[#ff9fcb] hover:underline">
                    {art[result.songId]!.name}
                  </Link>
                  .
                </p>
              )}
            </ResultPanel>
          </div>
        )}
      </div>
    </div>
  );
}
