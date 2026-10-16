"""Build the RiftCompare vector marks (2026-10-16 rebrand; DECISIONS.md, "The
Riftbound rebrand").

  public/brand/r-mark.svg      the swirl R, traced from public/logo-r-green.png
  public/brand/wordmark.svg    R mark + "IFT COMPARE" (Oswald Bold outlines)

Both are single-colour (black) shapes used as CSS masks (globals.css .rb-mark /
.rb-wordmark), so the site paints them with whatever gradient the theme wants.
If the wordmark's width changes, update .rb-wordmark's aspect-ratio to match
the viewBox this prints.

  pip install potracer uharfbuzz fonttools pillow numpy
  # Oswald Bold (OFL): the static 700 TTF from Google Fonts
  python3 -I scripts/brand-wordmark.py . path/to/Oswald-700.ttf
"""
import sys
import numpy as np
from PIL import Image
import potrace
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

REPO, FONT = sys.argv[1], sys.argv[2]

# ── 1. Trace the R ────────────────────────────────────────────────────────────
SCALE = 4
img = Image.open(f"{REPO}/public/logo-r-green.png").convert("RGBA")
alpha = img.split()[3]
from PIL import ImageFilter
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
print("R bounds", rx0, ry0, rw, rh, file=sys.stderr)

with open(f"{REPO}/public/brand/r-mark.svg", "w") as f:
    f.write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{rx0} {ry0} {rw} {rh}">'
        f'<path fill-rule="evenodd" d="{r_d}"/></svg>\n'
    )

# ── 2. "IFT COMPARE" in Oswald Bold, shaped (kerning) by HarfBuzz ─────────────
TEXT = "IFT COMPARE"
blob = hb.Blob.from_file_path(FONT)
face = hb.Face(blob)
font = hb.Font(face)
buf = hb.Buffer()
buf.add_str(TEXT)
buf.guess_segment_properties()
hb.shape(font, buf, {"kern": True, "liga": False})

tt = TTFont(FONT)
gs = tt.getGlyphSet()
order = tt.getGlyphOrder()
upem = tt["head"].unitsPerEm
cap = tt["OS/2"].sCapHeight  # 810 / 1000

# Lockup geometry, in font units. The R mark is scaled so its body matches the
# cap height (its flourish rises above it, as in the owner's mockup), and the
# letters start a hair after the R's right edge.
R_H = cap * 1.16           # R mark height
R_W = R_H * rw / rh
GAP = cap * 0.02
x = R_W + GAP
pen = SVGPathPen(gs)
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    name = order[info.codepoint]
    # Font units are y-up; flip into SVG's y-down with the baseline at y=0.
    tp = TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset))
    gs[name].draw(tp)
    x += pos.x_advance
text_d = pen.getCommands()
text_w = x

# The R sits on the baseline: its bottom at y=0, top at -R_H.
s = R_H / rh
r_transform = f"matrix({s:.5f} 0 0 {s:.5f} {-rx0 * s:.3f} {-ry0 * s - R_H:.3f})"
top = -R_H
height = R_H
width = text_w
with open(f"{REPO}/public/brand/wordmark.svg", "w") as f:
    f.write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top:.1f} {width:.1f} {height:.1f}">'
        f'<path fill-rule="evenodd" transform="{r_transform}" d="{r_d}"/>'
        f'<path d="{text_d}"/></svg>\n'
    )
print(f"wordmark viewBox 0 {top:.1f} {width:.1f} {height:.1f} -> aspect {width / height:.4f}", file=sys.stderr)
print(f"cap/height {cap / height:.4f}", file=sys.stderr)
