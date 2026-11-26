// BRAG CARDS (2026-11-26, owner: "the community is really, really important, because when people talk about things, that's when
// things really blow up"; community plan move 4, target 200 shares in December). One picture a visitor is proud to post: their
// stash's value, the price they found, the hit they pulled. Drawn IN THE BROWSER on a canvas (no server, no function, no Vercel
// image cost) at 1080×1350, the 4:5 portrait that fills a phone in a chat, a Discord channel and an Instagram feed or story, and
// handed to the phone's share sheet as a file with the link back to our page. Where files can't be shared (most desktops) it
// saves the picture (a JPEG, a few hundred KB) and copies the link.
//
// Only real numbers the page already shows; nothing is sent to us. `bragModel` is pure (tests/brag-card.test.ts); `drawBrag`
// and `shareBrag` need a browser. The same file in every site that draws one; port fixes by hand.

export type Tone = "up" | "down" | "neutral";

export interface BragInput {
  /** the site's name, drawn as the wordmark */
  site: string;
  /** the site's host, e.g. tcgprices.app */
  host: string;
  /** the site's accent colour, #rrggbb */
  accent: string;
  /** a short line above the title, e.g. "MY SEALED STASH" */
  kicker: string;
  title: string;
  /** the big number, already formatted */
  value: string;
  /** under the big number, e.g. "+8% since I added them" */
  pill?: { text: string; tone: Tone } | null;
  /** up to three label / value rows */
  rows?: { label: string; value: string; tone?: Tone }[];
  /** a same-origin or CORS-enabled picture; drawn only if it loads cleanly */
  image?: string | null;
  /** "card" is a trading card (5:7), "box" a sealed product photo */
  imageShape?: "card" | "box";
  /** the footer's call to action, e.g. "Track yours free" */
  cta: string;
  date: Date;
}

export interface BragModel extends Required<Omit<BragInput, "pill" | "image" | "date" | "rows">> {
  pill: { text: string; tone: Tone } | null;
  rows: { label: string; value: string; tone: Tone }[];
  image: string | null;
  day: string;
}

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const HEX = /^#[0-9a-f]{6}$/i;

export function bragModel(i: BragInput): BragModel {
  return {
    site: clip(i.site, 28),
    host: clip(i.host.replace(/^www\./, ""), 32),
    accent: HEX.test(i.accent) ? i.accent : "#3b82f6",
    kicker: clip(i.kicker.toUpperCase(), 34),
    title: clip(i.title, 64),
    value: clip(i.value, 16),
    pill: i.pill && i.pill.text ? { text: clip(i.pill.text, 40), tone: i.pill.tone } : null,
    rows: (i.rows ?? []).slice(0, 3).map((r) => ({ label: clip(r.label, 60), value: clip(r.value, 22), tone: r.tone ?? "neutral" })),
    image: i.image && (i.image.startsWith("/") || i.image.startsWith("https://")) ? i.image : null,
    imageShape: i.imageShape ?? "box",
    cta: clip(i.cta, 30),
    day: i.date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
  };
}

/** The tracked link a card points to: our page, with where it was shared from. */
export function bragLink(origin: string, path: string, kind: string): string {
  const u = new URL(path, origin);
  u.searchParams.set("utm_source", "share");
  u.searchParams.set("utm_medium", "brag-card");
  u.searchParams.set("utm_campaign", kind);
  return u.toString();
}

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const W = 1080;
const H = 1350;
const UP = "#4ade80";
const DOWN = "#f87171";
const toneColour = (t: Tone) => (t === "up" ? UP : t === "down" ? DOWN : "#cbd5e1");
const font = (w: number, px: number) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, Inter, Arial, sans-serif`;

function loadImage(src: string, timeoutMs = 2500): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    // Needed so the canvas stays readable (toBlob): a picture without CORS fails to load here instead of tainting it.
    if (!src.startsWith("/")) img.crossOrigin = "anonymous";
    const t = setTimeout(() => res(null), timeoutMs);
    img.onload = () => {
      clearTimeout(t);
      res(img.naturalWidth > 0 ? img : null);
    };
    img.onerror = () => {
      clearTimeout(t);
      res(null);
    };
    img.src = src;
  });
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

/** Wraps text into at most `lines` lines that fit `width`; the last is ellipsed. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number, lines: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (g.measureText(next).width <= width || !cur) cur = next;
    else {
      out.push(cur);
      cur = w;
      if (out.length === lines) break;
    }
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length === lines && out.join(" ").length < text.length) {
    let last = out[lines - 1];
    while (last.length > 1 && g.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    out[lines - 1] = `${last.trimEnd()}…`;
  }
  return out;
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Draws the card and returns it as a JPEG, or null when the browser can't (no canvas, blocked). */
export async function drawBrag(m: BragModel): Promise<Blob | null> {
  try {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return null;
    const img = m.image ? await loadImage(m.image) : null;

    // Ground: deep slate, a glow of the site's colour behind the picture, a fine grid for texture.
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0b1220");
    bg.addColorStop(1, "#05070d");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W / 2, 430, 40, W / 2, 430, 620);
    glow.addColorStop(0, withAlpha(m.accent, 0.55));
    glow.addColorStop(1, withAlpha(m.accent, 0));
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.035)";
    g.lineWidth = 1;
    for (let x = 0; x <= W; x += 54) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, H);
      g.stroke();
    }
    for (let y = 0; y <= H; y += 54) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(W, y + 0.5);
      g.stroke();
    }

    // Top: wordmark and date.
    g.textBaseline = "alphabetic";
    g.fillStyle = m.accent;
    rounded(g, 72, 68, 18, 18, 5);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = font(800, 36);
    g.fillText(m.site, 104, 88);
    g.fillStyle = "#94a3b8";
    g.font = font(600, 28);
    g.textAlign = "right";
    g.fillText(m.day, W - 72, 88);
    g.textAlign = "left";

    // Measure the words first, so the picture takes only the room they leave (never overlapping the panel or footer).
    g.font = font(700, 44);
    const titleLines = wrap(g, m.title, W - 160, 2);
    const rowsH = m.rows.length ? m.rows.length * 62 + 28 + 24 : 0;
    const wordsH = 58 + titleLines.length * 54 + 96 + 36 + (m.pill ? 96 : 30) + rowsH;
    const room = H - 170 - 150 - wordsH - 70;
    const maxH = Math.min(470, room);

    // The picture, or more room for the words.
    let y = 150;
    if (img && maxH >= 220) {
      const maxW = m.imageShape === "card" ? 340 : 600;
      const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
      const iw = Math.round(img.naturalWidth * s);
      const ih = Math.round(img.naturalHeight * s);
      const ix = Math.round((W - iw) / 2);
      const iy = y + Math.round((maxH - ih) / 2);
      g.save();
      g.shadowColor = "rgba(0,0,0,0.55)";
      g.shadowBlur = 60;
      g.shadowOffsetY = 24;
      if (m.imageShape === "box") {
        // product photos are usually on white: sit them on a soft plate so the edge reads on the dark ground
        g.fillStyle = "#ffffff";
        rounded(g, ix - 24, iy - 24, iw + 48, ih + 48, 28);
        g.fill();
        g.restore();
        g.save();
        rounded(g, ix, iy, iw, ih, 10);
        g.clip();
        g.drawImage(img, ix, iy, iw, ih);
      } else {
        rounded(g, ix, iy, iw, ih, 22);
        g.fillStyle = "#000";
        g.fill();
        g.restore();
        g.save();
        rounded(g, ix, iy, iw, ih, 22);
        g.clip();
        g.drawImage(img, ix, iy, iw, ih);
      }
      g.restore();
      y += maxH + 70;
    } else {
      y += Math.max(60, Math.round((room + 70) / 2));
    }

    // Words.
    g.textAlign = "center";
    g.fillStyle = m.accent;
    g.font = font(800, 28);
    const kick = m.kicker.split("").join(String.fromCharCode(8202));
    g.fillText(kick, W / 2, y);
    y += 58;
    g.fillStyle = "#e2e8f0";
    g.font = font(700, 44);
    for (const line of titleLines) {
      g.fillText(line, W / 2, y);
      y += 54;
    }
    y += 96;
    g.fillStyle = "#ffffff";
    let size = 132;
    g.font = font(900, size);
    while (g.measureText(m.value).width > W - 140 && size > 72) {
      size -= 6;
      g.font = font(900, size);
    }
    g.fillText(m.value, W / 2, y);
    y += 36;
    if (m.pill) {
      let ps = 34;
      g.font = font(800, ps);
      while (g.measureText(m.pill.text).width > W - 224 && ps > 24) g.font = font(800, (ps -= 2));
      const tw = g.measureText(m.pill.text).width;
      const pw = tw + 64;
      const px = (W - pw) / 2;
      g.fillStyle = withAlpha(m.pill.tone === "up" ? UP : m.pill.tone === "down" ? DOWN : "#94a3b8", 0.16);
      rounded(g, px, y, pw, 64, 32);
      g.fill();
      g.fillStyle = toneColour(m.pill.tone);
      g.fillText(m.pill.text, W / 2, y + 32 + ps * 0.36);
      y += 96;
    } else y += 30;

    // Detail rows in a glass panel.
    if (m.rows.length) {
      const rh = 62;
      const ph = m.rows.length * rh + 28;
      const py = y;
      g.fillStyle = "rgba(255,255,255,0.06)";
      rounded(g, 96, py, W - 192, ph, 24);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.stroke();
      m.rows.forEach((r, n) => {
        const ry = py + 14 + n * rh + 42;
        g.textAlign = "right";
        g.fillStyle = toneColour(r.tone);
        g.font = font(800, 32);
        g.fillText(r.value, W - 132, ry);
        const vw = g.measureText(r.value).width;
        g.textAlign = "left";
        g.fillStyle = "#94a3b8";
        g.font = font(600, 30);
        let label = r.label;
        const max = W - 264 - vw - 28;
        while (label.length > 1 && g.measureText(label).width > max) label = label.slice(0, -2).trimEnd() + "…";
        g.fillText(label, 132, ry);
      });
    }

    // Footer: the way back to us.
    g.textAlign = "left";
    const fy = H - 128;
    g.fillStyle = withAlpha(m.accent, 0.95);
    rounded(g, 72, fy, W - 144, 72, 36);
    g.fill();
    g.fillStyle = "#0b1220";
    g.font = font(800, 32);
    g.fillText(m.cta, 112, fy + 47);
    g.textAlign = "right";
    g.font = font(700, 30);
    g.fillText(`${m.host} →`, W - 112, fy + 47);
    g.textAlign = "left";

    return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), "image/jpeg", 0.92));
  } catch {
    return null;
  }
}

// A phone lets a page open its share sheet only for a short while after the tap, so a card whose photo is still loading
// can miss it. `prepareBrag` draws ahead (the page calls it when the numbers are known, in idle time) and the tap reuses
// the same promise. One card per model is kept; a new model replaces it.
let prepared: { key: string; blob: Promise<Blob | null> } | null = null;
export function prepareBrag(m: BragModel): Promise<Blob | null> {
  const key = JSON.stringify(m);
  if (prepared?.key !== key) prepared = { key, blob: drawBrag(m) };
  return prepared.blob;
}

/** Runs `fn` when the browser is idle (or soon, where it has no idle callback). Returns a cancel. */
export function whenIdle(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
  if (w.requestIdleCallback) {
    const n = w.requestIdleCallback(fn, { timeout: 3000 });
    return () => w.cancelIdleCallback?.(n);
  }
  const t = setTimeout(fn, 800);
  return () => clearTimeout(t);
}

export type ShareHow = "image" | "text" | "saved" | "copied" | "cancelled" | "failed";

/** Saves a blob as a file (the desktop fallback). */
export function saveBlob(b: Blob, name: string): void {
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Shares the picture with its text and link: the phone's share sheet with the file where it can, else the share sheet with the
 * link, else the picture saved and the link copied. Returns what really happened, so only a real share is counted.
 */
export async function shareBrag(blob: Blob | null, text: string, url: string, filename: string): Promise<ShareHow> {
  const file = blob ? new File([blob], `${filename}.jpg`, { type: "image/jpeg" }) : null;
  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: `${text} ${url}` });
      return "image";
    }
    if (navigator.share) {
      await navigator.share({ text, url });
      return "text";
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return "cancelled";
  }
  if (file) saveBlob(file, `${filename}.jpg`);
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return file ? "saved" : "copied";
  } catch {
    return file ? "saved" : "failed";
  }
}
