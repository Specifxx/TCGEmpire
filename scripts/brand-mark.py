"""Build public/brand/r-mark.svg: the swirl R, traced from public/logo-r-green.png
(2026-10-16 rebrand; DECISIONS.md, "The Riftbound rebrand").

It is a single-colour (black) shape used as a CSS mask (globals.css .rb-mark),
so the site paints it with whatever gradient the theme wants.

  pip install potracer pillow numpy
  python3 -I scripts/brand-mark.py .
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
import potrace

REPO = sys.argv[1]

SCALE = 4
img = Image.open(f"{REPO}/public/logo-r-green.png").convert("RGBA")
alpha = img.split()[3]
# A light blur before thresholding irons the 8-bit palette's stair-steps out of
# the edge, so the trace is a few long curves instead of hundreds of short ones.
big = alpha.resize((img.width * SCALE, img.height * SCALE), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
bm = potrace.Bitmap(np.array(big) <= 127)  # potracer fills the False side
plist = bm.trace(turdsize=40, alphamax=1.1, opticurve=True, opttolerance=0.6)

def fmt(v):
    return f"{v / SCALE:.1f}".rstrip("0").rstrip(".")

def curve_d(curve):
    sp = curve.start_point
    d = [f"M{fmt(sp.x)} {fmt(sp.y)}"]
    for seg in curve.segments:
        if seg.is_corner:
            d.append(f"L{fmt(seg.c.x)} {fmt(seg.c.y)}L{fmt(seg.end_point.x)} {fmt(seg.end_point.y)}")
        else:
            d.append(f"C{fmt(seg.c1.x)} {fmt(seg.c1.y)} {fmt(seg.c2.x)} {fmt(seg.c2.y)} {fmt(seg.end_point.x)} {fmt(seg.end_point.y)}")
    d.append("Z")
    return "".join(d)

r_d = "".join(curve_d(c) for c in plist)
# Tight bounds of the glyph in source pixels.
ys, xs = np.nonzero(np.array(alpha) > 127)
rx0, rx1, ry0, ry1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
rw, rh = rx1 - rx0, ry1 - ry0

with open(f"{REPO}/public/brand/r-mark.svg", "w") as f:
    f.write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{rx0} {ry0} {rw} {rh}">'
        f'<path fill-rule="evenodd" d="{r_d}"/></svg>\n'
    )
