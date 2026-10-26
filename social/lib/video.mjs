// One vertical video (1080x1920) for TikTok, Instagram Reels and YouTube Shorts,
// written as an HTML page that social/render-reel.mjs films frame by frame.
// Every motion is a CSS animation with an absolute delay, so the renderer can
// seek any frame exactly. Safe area: TikTok and Reels draw their buttons down
// the right edge and the caption over the bottom fifth, so everything that
// matters sits inside x 70–910, y 170–1480.
import { STYLE, RASTERIZE, swirl, wordmark, esc } from "./style.mjs";

const HOOK = 2.6;
const CTA = 3.6;

/**
 * scenes: [{ kind: "hook", kicker, title, title2?, ribbon }
 *          | { kind: "card", badge, badgeTone, art, landscape?, name, meta, value, sub?, len }
 *          | { kind: "rows", title, rows: [{ chip, main, side, note? }], len }
 *          | { kind: "bridge", text, len }]
 * The CTA is added at the end.
 */
export function videoHtml({ accent = "#34d17e", scenes, cta, legal }) {
  let t = 0;
  const parts = [];
  for (const s of scenes) {
    const len = s.len ?? (s.kind === "hook" ? HOOK : 2.4);
    parts.push(SCENE[s.kind](s, t, len));
    t += len;
  }
  parts.push(ctaScene(cta, legal, t, CTA));
  const duration = +(t + CTA).toFixed(2);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>reel</title>
<style>${STYLE}
:root { --accent: ${accent}; }
html, body { width: 1080px; height: 1920px; overflow: hidden; }
</style></head><body>
<div class="stage">
  ${swirl(duration)}
  ${parts.join("\n")}
</div>
<script>
window.REEL = { width: 1080, height: 1920, duration: ${duration}, cover: ${(HOOK * 0.75).toFixed(2)} };
// Count-ups: an element with data-to counts from 0 over 0.5 s from data-at.
window.onReelFrame = (ms) => {
  const t = ms / 1000;
  for (const el of document.querySelectorAll("[data-to]")) {
    const at = +el.dataset.at, to = +el.dataset.to, dp = +(el.dataset.dp || 0);
    const k = Math.max(0, Math.min(1, (t - at) / 0.5));
    const v = to * (1 - Math.pow(1 - k, 3));
    el.textContent = (el.dataset.pre || "") + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + (el.dataset.post || "");
  }
};
window.onReelFrame(0);
</script>
${RASTERIZE}
</body></html>`;
}

const show = (t, len) => `animation: show ${len}s linear ${t}s both;`;
const out = (t, len) => `out .28s ease-in ${(t + len - 0.28).toFixed(2)}s forwards`;

const SCENE = {
  hook(s, t, len) {
    return `<section class="scene" style="${show(t, len)}">
  <div class="rays" style="animation: spin 24s linear 0s both, fadein .5s ease-out ${t}s both;"></div>
  <div class="abs center" style="top: 230px; animation: drop .45s ease-out ${t + 0.25}s both;">${wordmark(84)}</div>
  <div class="abs center cinzel" style="top: 530px; font-size: 42px; color: #fff; letter-spacing: 8px; white-space: nowrap; animation: rise .45s ease-out ${t + 0.1}s both;">${esc(s.kicker)}</div>
  <div class="abs center hot" style="top: 610px; font-size: ${s.titleSize ?? 210}px; line-height: .92; animation: slam .55s cubic-bezier(.2,.9,.3,1) ${t + 0.15}s both;">${esc(s.title)}</div>
  ${s.title2 ? `<div class="abs center outline" style="top: ${s.title2Top ?? 860}px; font-size: ${s.title2Size ?? 150}px; line-height: 1; animation: slam .5s cubic-bezier(.2,.9,.3,1) ${t + 0.6}s both;">${esc(s.title2)}</div>` : ""}
  <div class="abs center" style="top: 1150px; animation: pop .4s ease-out ${t + 1.0}s both;"><span class="ribbon">${esc(s.ribbon)}</span></div>
  ${s.line ? `<div class="abs center" style="top: 1280px; left: 90px; right: 90px; font-size: 40px; font-weight: 800; color: #fff; animation: rise .4s ease-out ${t + 1.3}s both;">${esc(s.line)}</div>` : ""}
  <div class="flash" style="animation: flash .6s ease-out ${t + 0.12}s both;"></div>
</section>`;
  },

  card(s, t, len) {
    const w = s.landscape ? 840 : 560, h = s.landscape ? 601 : 782;
    const top = s.landscape ? 420 : 320;
    const textTop = top + h + 40;
    return `<section class="scene" style="${show(t, len)}${s.badgeTone === "down" ? " --accent: var(--down);" : ""}">
  <div class="abs center" style="top: 150px; animation: pop .35s ease-out ${t}s both, ${out(t, len)};"><span class="badge ${s.badgeTone ?? ""}">${esc(s.badge)}</span></div>
  <div class="card" style="top: ${top}px; width: ${w}px; height: ${h}px; margin-left: -${w / 2}px; animation: cardin .5s cubic-bezier(.2,.9,.3,1) ${t + 0.05}s both, ${out(t, len)};">
    <div style="position:absolute; inset:0; animation: hover 2.4s ease-in-out ${t}s infinite both;">
      <div class="face"><img src="${esc(s.art)}"><div class="shine" style="animation: sweep .9s ease-in-out ${t + 0.4}s both;"></div></div>
    </div>
  </div>
  <div class="abs center" style="top: ${textTop}px; left: 70px; right: 70px; animation: rise .3s ease-out ${t + 0.25}s both, ${out(t, len)};">
    <div class="cname">${esc(s.name)}</div>
    <div class="cmeta">${esc(s.meta)}</div>
    <div class="price">${s.value}</div>
    ${s.sub ? `<div class="small" style="margin-top: 12px;">${esc(s.sub)}</div>` : ""}
  </div>
</section>`;
  },

  rows(s, t, len) {
    const step = Math.min(0.75, (len - 2) / s.rows.length);
    return `<section class="scene" style="${show(t, len)}">
  <div class="abs center outline" style="top: 190px; font-size: 92px; line-height: 1.02; animation: slam .45s ease-out ${t}s both;">${s.title}</div>
  ${s.subtitle ? `<div class="abs center small" style="top: ${s.subtitleTop ?? 420}px; font-size: 32px; color: var(--gold); animation: fadein .3s ease-out ${t + 0.3}s both;">${esc(s.subtitle)}</div>` : ""}
  <div class="abs" style="left: 70px; right: 150px; top: ${s.rowsTop ?? 500}px;">
    ${s.rows.map((r, i) => `<div class="mrow" style="animation: rise .35s ease-out ${(t + 0.6 + i * step).toFixed(2)}s both;">
      <span class="chip">${esc(r.chip)}</span>
      <span class="mmain">${esc(r.main)}${r.note ? `<small>${esc(r.note)}</small>` : ""}</span>
      <span class="mside">${r.side}</span>
    </div>`).join("\n    ")}
  </div>
  <div class="flash" style="animation: flash .5s ease-out ${t}s both;"></div>
</section>`;
  },

  bridge(s, t, len) {
    return `<section class="scene" style="${show(t, len)}">
  <div class="abs center outline" style="top: 720px; font-size: 130px; line-height: 1.02; animation: slam .45s ease-out ${t}s both;">${s.text}</div>
  <div class="flash" style="animation: flash .5s ease-out ${t}s both;"></div>
</section>`;
  },
};

function ctaScene(cta, legal, t, len) {
  return `<section class="scene" style="animation: show ${len + 0.01}s linear ${t}s both;">
  <div class="rays" style="animation: spin 30s linear 0s both, fadein .7s ease-out ${t}s both;"></div>
  <div class="abs center" style="top: 430px; animation: slam .55s ease-out ${t + 0.05}s both;">${wordmark(150)}</div>
  <div class="abs center cinzel" style="top: 600px; font-size: 46px; color: #fff; letter-spacing: 6px; animation: rise .4s ease-out ${t + 0.35}s both;">RIFTBOUND <span style="color: var(--gold); font-size: 32px;">PRICE</span> TRACKER</div>
  <div class="abs center" style="top: 760px; left: 70px; right: 70px; font-size: 54px; font-weight: 900; line-height: 1.2; animation: rise .45s ease-out ${t + 0.7}s both;">${cta}</div>
  <div class="abs center" style="top: 1010px; animation: pop .45s ease-out ${t + 1.1}s both, kick .5s ease-out ${t + 1.8}s both, kick .5s ease-out ${t + 2.8}s both;"><span class="cta">riftcompare.com</span></div>
  <div class="abs center small" style="top: 1200px; font-size: 34px; color: var(--accent); animation: fadein .4s ease-out ${t + 1.4}s both;">Free · link in bio</div>
  <div class="abs center small" style="left: 90px; right: 90px; top: 1320px; font-size: 22px; line-height: 1.45; color: #8e9ab0; animation: fadein .4s ease-out ${t + 1.5}s both;">${esc(legal)}</div>
  <div class="flash" style="animation: flash .6s ease-out ${t}s both;"></div>
</section>`;
}
