"""Calm lo-fi soundtrack for the square Radiance video (38 s, 80 BPM, C major).

Owner (2026-10-23): the reel's track was "a bit too annoying, make it more
calm". So: no impacts, no risers, no riser-into-drop. A Rhodes-style electric
piano on Fmaj7 – Em7 – Dm7 – Cmaj7, a soft sub bass, a brushed swung beat from
the second scene, a little vinyl warmth, one soft chime under the chase card.
Synthesised from scratch (no samples, no licensed music).

    python soundtrack.py            # writes soundtrack.wav next to this file
Needs numpy and scipy.
"""
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
DUR = 38.0
BPM = 80
BEAT = 60 / BPM          # 0.75 s
BAR = 4 * BEAT           # 3 s
N = int(SR * DUR)
rng = np.random.default_rng(80)
L = np.zeros(N)
R = np.zeros(N)


def t_of(n):
    return np.arange(n) / SR


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or at < 0:
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


def note(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# Fmaj7, Em7, Dm7, Cmaj7: (bass root, voicing)
CHORDS = [(41, [57, 60, 64, 65]), (40, [55, 59, 62, 64]), (38, [53, 57, 60, 62]), (36, [52, 55, 59, 60])]


def chord_at(t):
    return CHORDS[int(t // BAR) % 4]


def ep(at, m, length=2.6, gain=0.1):
    """Electric piano: a sine with a little bell on the attack and a slow tremolo."""
    n = int(length * SR)
    t = t_of(n)
    f = note(m)
    tone = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3)
    tine = 0.12 * np.sin(2 * np.pi * 7.0 * f * t) * np.exp(-t * 18)
    env = np.minimum(1, t / 0.008) * np.exp(-t * 1.1)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 4.2 * t)
    x = lp((tone + tine) * env * trem, 3000)
    add(x * gain, at, pan=((m % 5) - 2) * 0.12)


def sub(at, m, length=1.3, gain=0.32):
    n = int(length * SR)
    t = t_of(n)
    x = np.sin(2 * np.pi * note(m) * t) * np.minimum(1, t / 0.02) * np.exp(-t * 1.6)
    add(x * gain, at)


def kick(at, gain=0.42):
    n = int(0.35 * SR)
    t = t_of(n)
    f = 48 + 40 * np.exp(-t * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    add(lp(x, 900) * gain, at)


def brush(at, gain=0.13):
    """A soft, brushed snare: band-passed noise with a slow tail."""
    n = int(0.35 * SR)
    t = t_of(n)
    x = bp(rng.standard_normal(n), 1200, 6000) * (np.minimum(1, t / 0.006) * np.exp(-t * 11))
    add(x * gain, at, pan=0.1)


def shaker(at, gain=0.045):
    n = int(0.09 * SR)
    t = t_of(n)
    x = hp(rng.standard_normal(n), 6500) * np.sin(np.pi * np.minimum(1, t / 0.09))
    add(x * gain, at, pan=-0.3)


def chime(at, m, gain=0.07):
    n = int(2.5 * SR)
    t = t_of(n)
    f = note(m)
    x = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t * 2)) * np.exp(-t * 1.4)
    add(x * gain, at, pan=0.35)


# ── arrangement ────────────────────────────────────────────────────────────────
bars = int(np.ceil(DUR / BAR))
for b in range(bars):
    t0 = b * BAR
    root, voicing = chord_at(t0)
    # The chord on beat 1, softly again on the "and" of 2; a gentle strum.
    for k, m in enumerate(voicing):
        ep(t0 + k * 0.018, m, 2.9, 0.085)
        ep(t0 + 1.5 * BEAT + k * 0.014, m, 1.6, 0.045)
    sub(t0, root + 12)
    sub(t0 + 2 * BEAT, root + 12, gain=0.24)

# A quiet melody line every other bar, from the title scene on.
MOTIF = [(0.0, 76), (1.0, 79), (1.5, 81), (2.5, 79)]
for b in range(1, bars - 1, 2):
    for beat, m in MOTIF:
        ep(b * BAR + beat * BEAT, m, 1.4, 0.05)

# Drums from the second scene (4.5 s) to the CTA (34 s), lightly swung.
swing = 0.06
t = 4.5
k = 0
while t < 34.0:
    beat_in_bar = k % 4
    if beat_in_bar == 0:
        kick(t)
    if beat_in_bar == 1:
        kick(t + BEAT / 2 + swing, 0.25)
    if beat_in_bar in (1, 3):
        brush(t)
    shaker(t, 0.04)
    shaker(t + BEAT / 2 + swing, 0.03)
    t += BEAT
    k += 1

# One soft chime under the chase card (30 s), and a resolving one at the CTA.
for i, m in enumerate([84, 88, 91]):
    chime(30.4 + i * 0.22, m, 0.05)
chime(34.2, 84, 0.05)
chime(34.5, 79, 0.045)

# Vinyl warmth: low noise, plus sparse crackle.
bed = lp(rng.standard_normal(N), 2500) * 0.004
crackle = np.zeros(N)
idx = rng.integers(0, N, size=int(DUR * 9))
crackle[idx] = rng.uniform(-1, 1, size=len(idx)) * 0.05
crackle = bp(crackle, 1500, 8000)
L += bed + crackle
R += bed + np.roll(crackle, 37)

# ── master: a soft room, gentle glue, a slow fade ─────────────────────────────
ir_n = int(2.2 * SR)
ir_t = t_of(ir_n)
ir_l = lp(rng.standard_normal(ir_n), 5000) * np.exp(-ir_t * 2.4)
ir_r = lp(rng.standard_normal(ir_n), 5000) * np.exp(-ir_t * 2.4)
ir_l[0] = ir_r[0] = 0
wet_l = fftconvolve(hp(L, 200), ir_l)[:N] * 0.035
wet_r = fftconvolve(hp(R, 200), ir_r)[:N] * 0.035
mix = np.stack([L + wet_l, R + wet_r])
mix = hp(mix, 30)
mix = lp(mix, 11000)  # take the edge off; lo-fi, not bright
mix = mix / (np.percentile(np.abs(mix), 99.7) / 0.7)
mix = np.tanh(mix)
fade = np.ones(N)
fade[: int(1.2 * SR)] = np.linspace(0, 1, int(1.2 * SR)) ** 1.5
fade[-int(2.5 * SR):] = np.linspace(1, 0, int(2.5 * SR)) ** 1.6
mix *= fade
mix /= np.max(np.abs(mix)) / 0.89
# To about -16 LUFS: a calm track sits a little under Instagram's -14 target,
# and Instagram turns quieter uploads up anyway. Measured with `ffmpeg -af
# ebur128`: -11.7 LUFS at the line above, so -4.3 dB.
mix *= 10 ** (-4.3 / 20)

out = Path(__file__).with_name("soundtrack.wav")
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype("<i2").tobytes())
print(out, f"{DUR:.0f}s")
