import { Jimp } from "jimp";
async function main() {
  const img = await Jimp.read("public/rc-source.png");
  const W = img.bitmap.width, H = img.bitmap.height;
  const px = (x: number, y: number) => {
    const i = (y * W + x) * 4; const d = img.bitmap.data;
    return `(${x},${y}) rgba=${d[i]},${d[i+1]},${d[i+2]},${d[i+3]}`;
  };
  console.log("dims", W, H);
  console.log("corners:", px(4,4), "|", px(W-5,4), "|", px(4,H-5), "|", px(W-5,H-5));
  console.log("mid-left (R area):", px(Math.round(W*0.28), Math.round(H*0.45)));
  console.log("mid-right (C area):", px(Math.round(W*0.70), Math.round(H*0.45)));
  console.log("center gap:", px(Math.round(W*0.5), Math.round(H*0.5)));
  // categorize all pixels
  let green = 0, white = 0, other = 0;
  const d = img.bitmap.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    if (g > 110 && g > r + 30 && g > b + 30) green++;
    else if (r > 190 && g > 190 && b > 190) white++;
    else other++;
  }
  console.log("pixel categories — green:", green, "white:", white, "other(bg):", other);
  // column profile: for each column, count non-bg (green|white) pixels, to find R/C split gap
  const cols: number[] = [];
  for (let x = 0; x < W; x++) {
    let c = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4; const r = d[i], g = d[i+1], b = d[i+2];
      const isGreen = g > 110 && g > r + 30 && g > b + 30;
      const isWhite = r > 190 && g > 190 && b > 190;
      if (isGreen || isWhite) c++;
    }
    cols.push(c);
  }
  // find left content start, right content end, and the gap (min) in the middle third
  const firstX = cols.findIndex((c) => c > 3);
  const lastX = cols.length - 1 - [...cols].reverse().findIndex((c) => c > 3);
  let gapX = -1, gapVal = 1e9;
  for (let x = Math.round(W*0.4); x < Math.round(W*0.6); x++) { if (cols[x] < gapVal) { gapVal = cols[x]; gapX = x; } }
  console.log("content firstX", firstX, "lastX", lastX, "mid-gap at x", gapX, "val", gapVal);
}
main().catch((e) => { console.error(e); process.exit(1); });
