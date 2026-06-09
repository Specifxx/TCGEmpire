// Perceptual image hashing (dHash) shared by the card scanner (browser) and the
// build-time hash precompute (Node/Jimp). The grayscale pixels are produced
// differently in each environment (canvas vs Jimp), but the bit-derivation and
// distance maths MUST be identical so a phone-captured card matches the stored
// card-image hash.
//
// dHash: downscale to 9×8 grayscale, then for each row compare each pixel to its
// right neighbour (9 cols → 8 comparisons × 8 rows = 64 bits), packed into 16 hex
// chars. Robust to brightness/contrast shifts (it encodes gradients, not absolute
// values), which is what we want for photos under varied lighting.

export const DHASH_W = 9;
export const DHASH_H = 8;

// `gray` is a row-major array of length DHASH_W*DHASH_H (72) with luminance 0..255.
export function dHashFromGray(gray: number[]): string {
  let bits = "";
  for (let row = 0; row < DHASH_H; row++) {
    for (let col = 0; col < DHASH_W - 1; col++) {
      const i = row * DHASH_W + col;
      bits += gray[i] < gray[i + 1] ? "1" : "0";
    }
  }
  // 64 bits → 16 hex chars.
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

// Standard luminance from 8-bit RGB.
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
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    d += POPCOUNT[x];
  }
  return d;
}
