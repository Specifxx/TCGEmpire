// Seraphine's Piano — the game's rules, as pure functions (2026-10-16, owner: "a
// really, really creative game called Seraphine's Piano… related to the upcoming
// Radiance release… very graphic, very dynamic… a mini game, which is kind of fun
// to play… everything's very smooth"). DECISIONS.md, "Seraphine's Piano".
//
// A rhythm game. Notes fall down four lanes onto Seraphine's piano; hit each one
// as it reaches the line and it plays its note of the melody, so playing well IS
// the music. Three songs, named for her Radiance cards. Everything here is
// deterministic and DOM-free so the timing and scoring are testable; the
// component (components/games/SeraphinesPiano.tsx) only draws and listens.

export const LANES = 4;

export type SongId = "starry" | "encore" | "not-alone";

export interface Song {
  id: SongId;
  title: string;
  difficulty: "Easy" | "Normal" | "Hard";
  /** The Radiance card the song is named for (its art fronts the song card). */
  cardSlug: string;
  bpm: number;
  bars: number;
  /** How far a note falls per second, as a share of the play field's height. */
  fallSpeed: number;
  /** Chord roots for one cycle, as MIDI note numbers (the cycle repeats). */
  progression: number[][];
  /** Chosen so the chart spreads evenly across the four keys (tests pin the balance). */
  seed: number;
  blurb: string;
}

export const SONGS: Song[] = [
  {
    id: "starry",
    title: "Starry-Eyed",
    difficulty: "Easy",
    cardSlug: "seraphine-starry-eyed-songstress-rad-151-167",
    bpm: 92,
    bars: 16,
    fallSpeed: 0.42,
    // C – G – Am – F
    progression: [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]],
    seed: 196,
    blurb: "A gentle warm-up. One note at a time, on the beat.",
  },
  {
    id: "encore",
    title: "Encore",
    difficulty: "Normal",
    cardSlug: "encore-rad-152-167",
    bpm: 108,
    bars: 20,
    fallSpeed: 0.52,
    // Am – F – C – G
    progression: [[45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50]],
    seed: 20,
    blurb: "Off-beats and quick runs. Charge the Encore and play it twice as loud.",
  },
  {
    id: "not-alone",
    title: "Not Alone",
    difficulty: "Hard",
    cardSlug: "seraphine-not-alone-rad-138-167",
    bpm: 124,
    bars: 24,
    fallSpeed: 0.62,
    // F – G – Em – Am
    progression: [[41, 45, 48], [43, 47, 50], [40, 43, 47], [45, 48, 52]],
    seed: 261,
    blurb: "Fast, with two-key chords. For when you know the stage.",
  },
];

export const songById = (id: string): Song => SONGS.find((s) => s.id === id) ?? SONGS[0];

export interface Note {
  id: number;
  /** Seconds from the start of the song. */
  t: number;
  lane: number;
  /** MIDI note number played when it is hit. */
  midi: number;
}

export interface BackingEvent {
  t: number;
  kind: "chord" | "kick" | "hat";
  midi?: number[];
}

export interface Chart {
  notes: Note[];
  backing: BackingEvent[];
  /** When the last note has passed the line, plus a short tail. */
  duration: number;
  beat: number;
}

/** A small deterministic RNG (mulberry32), so a song's chart never changes. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The melody lives in C major pentatonic across about an octave and a half, so
// any note sits well over any chord in the progressions above.
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79];

/** Which lane a pitch falls in: low notes left, high notes right, like a piano. */
export function laneForMidi(midi: number): number {
  // By position in the scale, not by semitones, so each key gets an even share
  // of the melody (the scale's steps are uneven).
  let idx = SCALE.indexOf(midi);
  if (idx < 0) idx = SCALE.findIndex((m) => m >= midi);
  if (idx < 0) idx = SCALE.length - 1;
  return Math.max(0, Math.min(LANES - 1, Math.floor(((idx + 0.5) * LANES) / SCALE.length)));
}

/**
 * The song's notes and backing. Rhythm per difficulty: Easy is quarter notes with
 * rests, Normal adds off-beat eighths, Hard adds quick pairs and two-lane chords.
 * The melody is a stepwise walk over the scale (mostly small steps, the odd leap),
 * which reads on the lanes as a hand moving across a keyboard.
 */
export function buildChart(song: Song): Chart {
  const r = rng(song.seed);
  const beat = 60 / song.bpm;
  const bar = beat * 4;
  const lead = bar; // one bar of backing before the first note
  const notes: Note[] = [];
  const backing: BackingEvent[] = [];
  let id = 0;
  // The hand moves across the keys: a walk over the four LANES (mostly one key at
  // a time, the odd jump, rarely a repeat), bouncing off either end so every key
  // gets its share. Each lane owns a slice of the scale, and the pitch is picked
  // from that slice, so the melody rises and falls with the hand.
  let lane = 1;
  let deg = 4;
  const step = () => {
    const roll = r();
    const size = roll < 0.72 ? 1 : roll < 0.92 ? 2 : 0;
    let next = lane + (r() < 0.5 ? -size : size);
    if (next < 0 || next > LANES - 1) next = lane - (next - lane);
    lane = Math.max(0, Math.min(LANES - 1, next));
    const slice = SCALE.map((_, i) => i).filter((i) => laneForMidi(SCALE[i]) === lane);
    deg = slice[Math.floor(r() * slice.length)] ?? deg;
    return SCALE[deg];
  };
  const push = (t: number, midi: number, lane = laneForMidi(midi)) => {
    // Never two notes in one lane closer than a fifth of a second: a chart has to be
    // physically playable with one finger per lane.
    const clash = notes.some((n) => n.lane === lane && Math.abs(n.t - t) < 0.2);
    if (!clash) notes.push({ id: id++, t, lane, midi });
  };

  const totalBars = song.bars + 1;
  for (let b = 0; b < totalBars; b++) {
    const t0 = b * bar;
    const chord = song.progression[b % song.progression.length];
    backing.push({ t: t0, kind: "chord", midi: chord });
    for (let q = 0; q < 4; q++) {
      backing.push({ t: t0 + q * beat, kind: q % 2 === 0 ? "kick" : "hat" });
      if (song.difficulty !== "Easy") backing.push({ t: t0 + q * beat + beat / 2, kind: "hat" });
    }
    if (b === 0 || b === totalBars - 1) continue; // the intro bar and the final chord carry no notes
    const tb = t0 + lead - bar; // notes start one bar in
    for (let q = 0; q < 4; q++) {
      const t = tb + q * beat;
      if (song.difficulty === "Easy") {
        // Rests on some off-beats keep it breathable.
        if (q % 2 === 1 && r() < 0.2) continue;
        push(t, step());
      } else if (song.difficulty === "Normal") {
        push(t, step());
        if (r() < 0.45) push(t + beat / 2, step());
      } else {
        push(t, step());
        if (r() < 0.6) push(t + beat / 2, step());
        if (r() < 0.18) {
          // a two-key chord: the melody note and a third below it, on another lane
          const m = SCALE[Math.max(0, deg - 2)];
          const lane = (laneForMidi(SCALE[deg]) + 2) % LANES;
          push(t, m, lane);
        }
      }
    }
  }
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  notes.forEach((n, i) => (n.id = i));
  const last = notes.length ? notes[notes.length - 1].t : 0;
  return { notes, backing, duration: Math.max(last + 1.5, totalBars * bar), beat };
}

// ── Judging ────────────────────────────────────────────────────────────────────

export type Judgement = "perfect" | "great" | "good" | "miss";

/** Hit windows, in seconds either side of the note. Generous, on purpose: it is a mini-game. */
export const WINDOWS = { perfect: 0.055, great: 0.1, good: 0.15 } as const;

export function judge(deltaSeconds: number): Judgement | null {
  const d = Math.abs(deltaSeconds);
  if (d <= WINDOWS.perfect) return "perfect";
  if (d <= WINDOWS.great) return "great";
  if (d <= WINDOWS.good) return "good";
  return null;
}

export const POINTS: Record<Judgement, number> = { perfect: 300, great: 200, good: 100, miss: 0 };

/** ×1, then ×2 at a 10 combo, ×3 at 25, ×4 at 50. */
export function multiplierFor(combo: number): number {
  return combo >= 50 ? 4 : combo >= 25 ? 3 : combo >= 10 ? 2 : 1;
}

export const ENCORE_SECONDS = 6;
export const ENCORE_GAIN: Record<Judgement, number> = { perfect: 9, great: 5, good: 2, miss: 0 };
export const HARMONY_START = 70;
export const HARMONY_GAIN: Record<Judgement, number> = { perfect: 3, great: 2, good: 1, miss: -9 };

export interface RunStats {
  perfect: number;
  great: number;
  good: number;
  miss: number;
  maxCombo: number;
  score: number;
  notes: number;
  cleared: boolean;
}

/** Accuracy as a share of a perfect run: a Perfect counts 1, Great ⅔, Good ⅓. */
export function accuracy(s: Pick<RunStats, "perfect" | "great" | "good" | "notes">): number {
  if (!s.notes) return 0;
  return (s.perfect + (s.great * 2) / 3 + s.good / 3) / s.notes;
}

export function grade(acc: number, cleared: boolean): "S" | "A" | "B" | "C" | "D" {
  if (!cleared) return "D";
  return acc >= 0.95 ? "S" : acc >= 0.85 ? "A" : acc >= 0.72 ? "B" : acc >= 0.55 ? "C" : "D";
}
