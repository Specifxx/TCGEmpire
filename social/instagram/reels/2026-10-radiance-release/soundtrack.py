"""Original soundtrack for the Radiance release reel (30 s, 120 BPM, A minor).

Synthesised from scratch (no samples, no licensed music), so Instagram will not
mute it. Cues match index.html: impacts on every scene cut, a whoosh into each
countdown card, a riser into #1 at 16 s, and the groove from 3 s to the end.

    python soundtrack.py            # writes soundtrack.wav next to this file
Needs numpy and scipy.
"""
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
DUR = 30.0
BPM = 120
BEAT = 60 / BPM          # 0.5 s
N = int(SR * DUR)
rng = np.random.default_rng(23)

L = np.zeros(N)
R = np.zeros(N)


def t_of(n):
    return np.arange(n) / SR


def add(sig, at, gain=1.0, pan=0.0):
    """Mix a mono signal in at time `at` (s), panned -1..1."""
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt((1 - pan) / 2) * 1.414
    R[i : i + len(sig)] += sig * np.sqrt((1 + pan) / 2) * 1.414


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def env(n, a=0.002, d=0.2, curve=4.0):
    t = t_of(n)
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) * curve / max(d, 1e-4))
    return e


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def saw(f, n, detune=0.0):
    t = t_of(n)
    ph = (t * f * (1 + detune)) % 1.0
    return 2 * ph - 1


# ── drums ──────────────────────────────────────────────────────────────────────
def kick():
    n = int(0.45 * SR)
    t = t_of(n)
    f = 45 + 110 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 1.6)


def clap():
    n = int(0.25 * SR)
    t = t_of(n)
    noise = bp(rng.standard_normal(n), 900, 5000)
    e = np.exp(-t * 22)
    for k in (0.008, 0.016):  # the three-hand flam of a clap
        e += 0.6 * (t > k) * np.exp(-np.maximum(0, t - k) * 60)
    return noise * e * 0.7


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = t_of(n)
    return hp(rng.standard_normal(n), 7500) * np.exp(-t * (14 if open_ else 70)) * 0.35


def crash():
    n = int(2.2 * SR)
    t = t_of(n)
    return hp(rng.standard_normal(n), 4000) * np.exp(-t * 2.2) * 0.45


# ── tonal ──────────────────────────────────────────────────────────────────────
# Am – F – C – G, one chord per bar (2 s), roots as MIDI.
CHORDS = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]


def chord_at(t):
    return CHORDS[int(max(0, t - 3.0) // 2.0) % 4]


def pad(at, length, tones, gain=0.18):
    n = int(length * SR)
    x = np.zeros(n)
    for m in tones:
        for d in (-0.006, 0.0, 0.007):
            x += saw(note(m), n, d)
    x = lp(x, 1400)
    a = np.minimum(1, t_of(n) / 0.5) * np.minimum(1, (length - t_of(n)) / 0.4)
    add(x * a * gain / len(tones), at, pan=-0.2)
    add(x * a * gain / len(tones), at + 0.012, pan=0.2)


def bass(at, midi, length=0.24, gain=0.5):
    n = int(length * SR)
    f = note(midi - 12)
    x = saw(f, n) * 0.6 + np.sin(2 * np.pi * f * t_of(n))
    x = lp(x, 520) * env(n, 0.003, length * 0.9, 3)
    add(np.tanh(x * 1.5) * gain, at)


def pluck(at, midi, gain=0.16, pan=0.0):
    n = int(0.3 * SR)
    x = saw(note(midi), n) + 0.5 * saw(note(midi), n, 0.004)
    x = lp(x, 3200) * env(n, 0.002, 0.18, 5)
    add(x * gain, at, pan=pan)


def bell(at, midi, gain=0.12):
    n = int(1.4 * SR)
    t = t_of(n)
    f = note(midi)
    x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.76 * t) + 0.25 * np.sin(2 * np.pi * f * 5.4 * t)) * np.exp(-t * 3.5)
    add(x * gain, at, pan=0.3)


# ── fx ─────────────────────────────────────────────────────────────────────────
def impact(at, gain=1.0):
    n = int(2.5 * SR)
    t = t_of(n)
    f = 30 + 40 * np.exp(-t * 6)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.8)
    hit = lp(rng.standard_normal(n), 1800) * np.exp(-t * 9) * 0.9
    add(np.tanh((sub * 1.2 + hit) * 1.3) * gain * 0.9, at)


def whoosh(end, length=0.45, gain=0.35):
    """Noise that sweeps up and swells into `end`."""
    n = int(length * SR)
    x = rng.standard_normal(n)
    chunks = 24
    out = np.zeros(n)
    edges = np.linspace(0, n, chunks + 1).astype(int)
    for k in range(chunks):
        a, b = edges[k], edges[k + 1]
        hz = 300 + (6000 - 300) * (k / chunks) ** 2
        out[a:b] = bp(x, hz * 0.7, min(hz * 1.4, SR / 2 - 100))[a:b]
    e = (t_of(n) / length) ** 2.2
    add(out * e * gain, end - length, pan=-0.3)
    add(out * e * gain, end - length + 0.01, pan=0.3)


def riser(start, end, gain=0.3):
    n = int((end - start) * SR)
    t = t_of(n)
    pos = t / (end - start)
    x = rng.standard_normal(n)
    out = np.zeros(n)
    edges = np.linspace(0, n, 41).astype(int)
    for k in range(40):
        a, b = edges[k], edges[k + 1]
        hz = 400 + 7000 * (k / 40) ** 2
        out[a:b] = bp(x, hz * 0.8, min(hz * 1.3, SR / 2 - 100))[a:b]
    # A pitched tone climbing an octave under the noise.
    f = note(69) * 2 ** pos
    tone = saw(1, n) * 0
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3
    add((out + tone) * pos ** 2 * gain, start)


# ── the arrangement ────────────────────────────────────────────────────────────
# Hook (0–3): drone, two slams, a shimmer.
pad(0.0, 3.2, [45, 52, 57, 60], gain=0.22)
impact(0.15, 1.0)
impact(0.65, 0.6)
add(crash(), 0.15, 0.6)
for i, m in enumerate([81, 84, 88, 93]):
    bell(1.15 + i * 0.25, m, 0.08)
riser(1.5, 3.0, 0.25)

# Groove (3–29.5): kick every beat, clap on 2 and 4, hats on the off-beats,
# bass in eighths, the pad one chord per bar.
for k in range(int((29.5 - 3.0) / BEAT)):
    t = 3.0 + k * BEAT
    if 18.6 < t < 19.0:
        continue  # a gap before the packs drop
    add(kick(), t, 0.9)
    if k % 2 == 1:
        add(clap(), t, 0.7, pan=0.05)
    add(hat(), t + BEAT / 2, 0.8, pan=0.35)
    if k % 4 == 3:
        add(hat(True), t + BEAT / 2, 0.5, pan=-0.35)
    root, _ = chord_at(t)
    bass(t, root, gain=0.42)
    bass(t + BEAT / 2, root + (12 if k % 4 == 2 else 0), gain=0.34)

for bar in range(int((29.0 - 3.0) / 2)):
    t = 3.0 + bar * 2
    _, tones = chord_at(t)
    pad(t, 2.05, [m + 12 for m in tones], gain=0.13)

# Arp in sixteenths under the countdown and the rest (8–29), two octaves up.
for k in range(int((29.0 - 8.0) / (BEAT / 4))):
    t = 8.0 + k * BEAT / 4
    if 15.0 <= t < 16.0 or 18.6 < t < 19.0:
        continue  # space for the riser into #1, and the pre-drop gap
    _, tones = chord_at(t)
    seq = [tones[0], tones[1], tones[2], tones[1] + 12]
    pluck(t, seq[k % 4] + 12, gain=0.12, pan=0.25 if k % 2 else -0.25)

# Scene cuts.
for t in (3.0, 7.0, 19.0, 23.0):
    impact(t, 0.75)
    add(crash(), t, 0.5)
whoosh(7.0, 0.5)

# The countdown: a whoosh into each card, a hit, a shimmer.
for i, t in enumerate((8.0, 10.0, 12.0, 14.0)):
    whoosh(t, 0.45, 0.3)
    impact(t, 0.55)
    bell(t + 0.45, 76 + i * 2, 0.07)
# #1: a riser and snare roll over the last bar, then the drop.
riser(14.6, 16.0, 0.4)
for k in range(16):
    tt = 15.0 + k * (1.0 / 16)
    add(clap(), tt, 0.15 + 0.5 * k / 16)
impact(16.0, 1.1)
add(crash(), 16.0, 0.8)
for i, m in enumerate([81, 84, 88, 93, 96]):
    bell(16.45 + i * 0.12, m, 0.07)

# The CTA: a last big hit, and the end of the bar rings out.
whoosh(26.0, 0.5, 0.35)
impact(26.0, 1.0)
add(crash(), 26.0, 0.7)
pad(26.0, 4.0, [57, 64, 69, 72], gain=0.16)

# ── master: a little room, glue, loudness ─────────────────────────────────────
ir_n = int(1.6 * SR)
ir_t = t_of(ir_n)
ir_l = rng.standard_normal(ir_n) * np.exp(-ir_t * 3.2)
ir_r = rng.standard_normal(ir_n) * np.exp(-ir_t * 3.2)
ir_l[0] = ir_r[0] = 0
wet_l = fftconvolve(hp(L, 250), ir_l)[:N] * 0.06
wet_r = fftconvolve(hp(R, 250), ir_r)[:N] * 0.06
mix = np.stack([L + wet_l, R + wet_r])
mix = hp(mix, 28)
# Gain-stage before the saturator: put the loudest sustained peaks at about
# 0.8, so tanh only rounds the transients instead of squaring the whole mix.
mix = mix / (np.percentile(np.abs(mix), 99.5) / 0.8)
mix = np.tanh(mix)
fade = np.ones(N)
fade[-int(0.8 * SR):] = np.linspace(1, 0, int(0.8 * SR)) ** 1.5
fade[: int(0.01 * SR)] = np.linspace(0, 1, int(0.01 * SR))
mix *= fade
mix /= np.max(np.abs(mix)) / 0.89  # about -1 dBFS peak
# Then to Instagram's loudness target, about -14 LUFS integrated. Measured with
# `ffmpeg -af ebur128=peak=true`: -10.2 LUFS at the line above, so -3.8 dB.
mix *= 10 ** (-3.8 / 20)

out = Path(__file__).with_name("soundtrack.wav")
pcm = (mix.T * 32767).astype("<i2")
import wave

with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(out, f"{DUR:.0f}s")
