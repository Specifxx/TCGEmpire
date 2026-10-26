"""An original backing track for a pack's video (no samples, no licensed music,
so no platform mutes it): a calm 120 BPM groove in A minor, Am-F-C-G.

    python3 social/soundtrack.py social/out/<pack> 29.4   # writes soundtrack.wav there

Needs numpy only. On TikTok you can swap it for a trending sound in the app
(keep "original sound" at 0); on YouTube and Instagram keep it, it's ours.
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
out_dir = Path(sys.argv[1])
DUR = float(sys.argv[2])
N = int(SR * (DUR + 0.5))
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * (1 - pan) / 2 * 2 ** 0.5
    R[i : i + len(sig)] += sig * (1 + pan) / 2 * 2 ** 0.5


def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)


def smooth(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.16)


def hat():
    n = int(0.06 * SR)
    x = rng.standard_normal(n)
    return (x - smooth(x, 6)) * env(n, 0.001, 0.02)


def snare():
    n = int(0.25 * SR)
    x = rng.standard_normal(n)
    t = np.arange(n) / SR
    return (smooth(x, 3) * 0.7 + np.sin(2 * np.pi * 190 * t) * 0.5) * env(n, 0.001, 0.08)


def tone(freq, length, bright=0.25):
    n = int(length * SR)
    t = np.arange(n) / SR
    s = sum((bright ** (h - 1)) * np.sin(2 * np.pi * freq * h * t + h) for h in range(1, 6))
    return s * np.minimum(1, t / 0.08) * np.minimum(1, (length - t) / 0.25)


A = lambda semis: 220 * 2 ** (semis / 12)
CHORDS = [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]]  # Am F C G
ROOTS = [0, -4, -9, -2]
bar = 4 * BEAT
for b in range(int(DUR / bar) + 1):
    t0 = b * bar
    ch = CHORDS[b % 4]
    for i, s in enumerate(ch):
        add(tone(A(s), bar, 0.18), t0, 0.055, pan=(-0.5, 0, 0.5)[i])
    add(tone(A(ROOTS[b % 4] - 24), bar * 0.95, 0.4), t0, 0.16)
    for beat in range(4):
        tb = t0 + beat * BEAT
        add(kick(), tb, 0.55 if beat in (0, 2) else 0.0)
        if beat in (1, 3):
            add(snare(), tb, 0.22)
        add(hat(), tb + BEAT / 2, 0.12, pan=0.3)
        add(hat(), tb, 0.06, pan=-0.3)
    # a little pluck melody on the off-beats
    for k, s in enumerate((ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[1] + 12)):
        add(tone(A(s), 0.3, 0.5) * env(int(0.3 * SR), 0.003, 0.12), t0 + k * BEAT + BEAT / 2, 0.07, pan=0.2)

mix = np.stack([L, R], axis=1)
fade = np.ones(N)
fade[-int(1.2 * SR) :] = np.linspace(1, 0, int(1.2 * SR))
mix = mix * fade[:, None]
mix = mix / np.max(np.abs(mix)) * 0.7
pcm = (mix * 32767).astype("<i2")
with wave.open(str(out_dir / "soundtrack.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(out_dir / "soundtrack.wav")
