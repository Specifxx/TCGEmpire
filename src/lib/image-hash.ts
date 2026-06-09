// Perceptual image hashing (dHash) shared by the card scanner (browser) and the
// build-time hash precompute (Node/Jimp).
//
// The reference hashes are computed from each card's `blurDataUrl` — a tiny base64
// placeholder stored IN THE DATABASE — so we never fetch the (server-blocked) image
// CDN. The browser hashes the camera capture with the same bit-logic, so a photo
// and the stored card hash are directly comparable.
//
// dHash: downscale to 9×8 grayscale, compare each pixel to its right neighbour
// (9 cols → 8 comparisons × 8 rows = 64 bits) packed into 16 hex chars. Robust to
// brightness/contrast (encodes gradients, not absolute values).

export const DHASH_W = 9;
export const DHASH_H = 8;

// `gray` is row-major, length DHASH_W*DHASH_H (72), luminance 0..255.
export function dHashFromGray(gray: number[]): string {
  let bits = "";
  for (let row = 0; row < DHASH_H; row++) {
    for (let col = 0; col < DHASH_W - 1; col++) {
      const i = row * DHASH_W + col;
      bits += gray[i] < gray[i + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const POPCOUNT = (() => {
  const t = new Uint8Array(16);
  for (let i = 0; i < 16; i++) t[i] = (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1);
  return t;
})();

// Hamming distance between two 16-hex (64-bit) hashes. 0 = identical, 64 = opposite.
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POPCOUNT[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}
