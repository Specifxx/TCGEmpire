// The RiftCompare social look (the Riftbound visual grammar, our mark): see
// social/README.md "Brand". Fonts and the swirl R are inlined, so a generated
// page is one self-contained file that renders the same anywhere.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./data.mjs";

const b64 = (p) => fs.readFileSync(path.join(ROOT, p)).toString("base64");
const font = (f) => `url(data:font/woff2;base64,${b64(`social/fonts/${f}`)}) format("woff2")`;
const LOGO = `url(data:image/png;base64,${b64("public/logo-r-green.png")})`;

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Card art as a data: URI when the site has a local copy, else its CDN URL.
export function artSrc(art) {
  if (!art) return "";
  if (art.local) {
    const ext = path.extname(art.local).slice(1).replace("jpg", "jpeg");
    return `data:image/${ext};base64,${fs.readFileSync(art.local).toString("base64")}`;
  }
  return art.remote;
}

export const wordmark = (size) => {
  const r = Math.round(size * 0.97);
  return `<div class="wordmark" style="font-size:${size}px"><span class="rmark" style="width:${r}px;height:${Math.round(r * 0.97)}px;margin-right:-${Math.round(size * 0.03)}px"></span><span class="grad">IFT</span><span style="width:${Math.round(size * 0.22)}px"></span><span class="grad">COMPARE</span></div>`;
};

// A marbled energy swirl (SVG turbulence) that drifts for the whole video.
export const swirl = (duration = 30, seed = 7) => `<svg class="bg" viewBox="0 0 1300 2300" preserveAspectRatio="xMidYMid slice" style="animation: drift ${duration}s linear 0s both;">
  <filter id="m"><feTurbulence type="fractalNoise" baseFrequency="0.0016 0.0034" numOctaves="4" seed="${seed}"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.1"/>
    <feComposite in="SourceGraphic" operator="in"/></filter>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1833"/><stop offset=".55" stop-color="var(--swirl, #3f78d8)"/><stop offset="1" stop-color="#05070f"/></linearGradient>
  <rect width="1300" height="2300" fill="#05070f"/>
  <rect width="1300" height="2300" fill="url(#g)" filter="url(#m)"/>
</svg><div class="shade"></div>`;

// SVG turbulence repaints on every frame and makes filming ~10x slower, so each
// swirl is drawn once into a canvas at load. The renderers await window.READY.
export const RASTERIZE = `<script>
window.READY = Promise.all([...document.querySelectorAll("svg.bg")].map((svg) => new Promise((done) => {
  const vb = svg.viewBox.baseVal;
  const xml = new XMLSerializer().serializeToString(svg).replace(/var\\(--swirl, ([^)]+)\\)/g, "$1");
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = vb.width; c.height = vb.height;
    c.getContext("2d").drawImage(img, 0, 0, vb.width, vb.height);
    c.className = svg.getAttribute("class");
    c.setAttribute("style", svg.getAttribute("style") || "");
    svg.replaceWith(c);
    done();
  };
  img.onerror = () => done();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
})));
</script>`;

export const STYLE = `
@font-face { font-family: "Anton"; src: ${font("Anton.woff2")}; }
@font-face { font-family: "Cinzel"; src: ${font("Cinzel.woff2")}; font-weight: 400 900; }
@font-face { font-family: "Montserrat"; src: ${font("Montserrat.woff2")}; font-weight: 100 900; }
:root { --void: #05070f; --gold: #ffcf5a; --filigree: #d4a94f; --electric: #2f6bff; --rc-green: #34d17e; --down: #ff5a5f; --text: #f4ead2; --muted: #a8b3c7; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--void); font-family: "Montserrat", sans-serif; color: var(--text); }
.stage { position: absolute; inset: 0; overflow: hidden; isolation: isolate; }
.abs { position: absolute; } .center { left: 0; right: 0; text-align: center; }
.bg { position: absolute; left: -110px; top: -190px; width: 1300px; height: 2300px; z-index: -3; }
.shade { position: absolute; inset: 0; z-index: -2;
  background: radial-gradient(ellipse 80% 55% at 50% 42%, rgba(5,7,15,.25), rgba(5,7,15,.8) 70%, rgba(5,7,15,.96)),
              linear-gradient(to bottom, rgba(5,7,15,.55), transparent 22%, transparent 70%, rgba(5,7,15,.9)); }
.scene { position: absolute; inset: 0; opacity: 0; }

@keyframes show { 0% { opacity: 0 } 0.01% { opacity: 1 } 99.99% { opacity: 1 } 100% { opacity: 0 } }
@keyframes drift { from { transform: translate(0,0) scale(1.04) rotate(0deg); } to { transform: translate(-60px,-120px) scale(1.12) rotate(3deg); } }
@keyframes slam { 0% { transform: scale(2.4); opacity: 0; filter: blur(14px); } 55% { transform: scale(.95); opacity: 1; filter: blur(0); } 75% { transform: scale(1.03); } 100% { transform: scale(1); opacity: 1; } }
@keyframes rise { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes drop { from { transform: translateY(-70px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes pop { 0% { transform: scale(.3); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
@keyframes out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(1.1); filter: blur(10px); } }
@keyframes flash { 0% { opacity: 0 } 10% { opacity: .9 } 100% { opacity: 0 } }
@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
@keyframes kick { 0% { transform: scale(1) } 12% { transform: scale(1.04) } 100% { transform: scale(1) } }
@keyframes cardin { 0% { transform: translateY(240px) rotateX(36deg) rotateZ(-8deg) scale(.7); opacity: 0; filter: blur(12px) brightness(2); }
  60% { transform: translateY(-16px) rotateX(-4deg) rotateZ(1deg) scale(1.03); opacity: 1; filter: blur(0) brightness(1.2); }
  100% { transform: none; opacity: 1; filter: none; } }
@keyframes hover { 0%, 100% { transform: translateY(0) rotateY(-5deg) } 50% { transform: translateY(-12px) rotateY(5deg) } }
@keyframes sweep { from { transform: translateX(-130%) skewX(-18deg) } to { transform: translateX(260%) skewX(-18deg) } }

.flash { position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, #fff, rgba(255,255,255,.35) 35%, transparent 75%); opacity: 0; pointer-events: none; z-index: 20; }
.rays { position: absolute; left: 50%; top: 42%; width: 2600px; height: 2600px; margin: -1300px 0 0 -1300px; z-index: -1;
  background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--accent) 22%, transparent) 0 6deg, transparent 6deg 18deg);
  -webkit-mask: radial-gradient(circle, #000 10%, transparent 60%); mask: radial-gradient(circle, #000 10%, transparent 60%); }

.wordmark { display: inline-flex; align-items: flex-end; justify-content: center; font-family: "Anton"; line-height: .86;
  filter: drop-shadow(0 4px 0 #6a1a00) drop-shadow(0 12px 22px rgba(0,0,0,.7)); }
.grad { background: linear-gradient(180deg, #ffe27a 0%, #ffb02e 40%, #ff7a1a 72%, #e2550c 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.rmark { display: inline-block; background: linear-gradient(180deg, #ffe27a 0%, #ffb02e 40%, #ff7a1a 72%, #e2550c 100%);
  -webkit-mask: ${LOGO} center bottom / contain no-repeat; mask: ${LOGO} center bottom / contain no-repeat; }
.cinzel { font-family: "Cinzel"; font-weight: 900; letter-spacing: 4px; }
.outline { font-weight: 900; text-transform: uppercase; color: #fff; -webkit-text-stroke: 9px var(--electric); paint-order: stroke fill;
  text-shadow: 0 0 34px rgba(47,107,255,.8), 0 8px 0 #0a1f66; }
.hot { font-family: "Anton"; text-transform: uppercase; background: linear-gradient(180deg, #fff 0%, color-mix(in srgb, var(--accent) 35%, #fff) 30%, var(--accent) 72%, color-mix(in srgb, var(--accent) 60%, #000) 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 28px color-mix(in srgb, var(--accent) 65%, transparent)) drop-shadow(0 10px 0 rgba(0,0,0,.6)); }
.ribbon { display: inline-block; padding: 12px 54px; font-family: "Cinzel"; font-weight: 900; font-size: 34px; letter-spacing: 7px; color: var(--gold);
  border-top: 3px solid var(--filigree); border-bottom: 3px solid var(--filigree); position: relative;
  background: linear-gradient(90deg, rgba(5,7,15,.3), rgba(5,7,15,.92) 50%, rgba(5,7,15,.3)); }
.ribbon::before, .ribbon::after { content: ""; position: absolute; top: 50%; width: 120px; height: 3px; background: var(--filigree); }
.ribbon::before { right: 100%; } .ribbon::after { left: 100%; }

.badge { display: inline-block; padding: 6px 40px 10px; border-radius: 18px; font-family: "Anton"; font-size: 110px; line-height: 1.05;
  color: #fff; background: rgba(5,7,15,.86); border: 3px solid var(--filigree); text-shadow: 0 6px 0 rgba(0,0,0,.6); }
.badge.up { color: var(--rc-green); border-color: var(--rc-green); box-shadow: 0 0 50px rgba(52,209,126,.4); }
.badge.down { color: var(--down); border-color: var(--down); box-shadow: 0 0 50px rgba(255,90,95,.35); }
.badge.rank { color: var(--gold); }
.card { position: absolute; left: 50%; perspective: 1400px; }
.card .face { position: absolute; inset: 0; border-radius: 28px; overflow: hidden; background: #111;
  box-shadow: 0 0 0 4px rgba(255,207,90,.9), 0 0 80px 20px color-mix(in srgb, var(--accent) 45%, transparent), 0 40px 80px rgba(0,0,0,.8); }
.card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.card .shine { position: absolute; top: -10%; bottom: -10%; width: 40%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent); mix-blend-mode: screen; transform: translateX(-130%); }
.cname { font-size: 54px; font-weight: 900; text-transform: uppercase; line-height: 1.04; color: #fff; text-shadow: 0 4px 18px rgba(0,0,0,.9); }
.cmeta { margin-top: 10px; font-family: "Cinzel"; font-weight: 900; font-size: 28px; letter-spacing: 3px; color: var(--gold); }
.price { display: inline-flex; align-items: baseline; gap: 18px; margin-top: 18px; padding: 10px 34px; border-radius: 16px; background: rgba(5,7,15,.88); border: 2px solid color-mix(in srgb, var(--accent) 70%, transparent); }
.price .from { font-size: 28px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 2px; }
.price .v { font-family: "Anton"; font-size: 84px; color: var(--accent); text-shadow: 0 0 24px color-mix(in srgb, var(--accent) 50%, transparent); }
.price .was { font-family: "Anton"; font-size: 52px; color: var(--muted); text-decoration: line-through; text-decoration-thickness: 4px; }
.small { font-size: 26px; font-weight: 700; color: var(--muted); }
.mrow { display: flex; align-items: center; gap: 24px; padding: 18px 28px; margin-bottom: 18px; border-radius: 18px; background: rgba(5,7,15,.86); border: 2px solid rgba(212,169,79,.5); }
.mrow .chip { width: 116px; text-align: center; font-family: "Anton"; font-size: 50px; color: var(--void); background: var(--filigree); border-radius: 10px; padding: 2px 0; }
.mrow .mmain { flex: 1; font-size: 34px; font-weight: 800; color: #fff; line-height: 1.15; }
.mrow .mmain small { display: block; font-size: 24px; font-weight: 600; color: var(--muted); }
.mrow .mside { font-family: "Anton"; font-size: 62px; color: var(--accent); }
.cta { display: inline-block; padding: 28px 64px; border-radius: 20px; background: var(--rc-green); color: #04140b; font-weight: 900; font-size: 66px;
  box-shadow: 0 0 0 4px rgba(5,7,15,.9), 0 0 0 8px var(--filigree), 0 20px 60px rgba(52,209,126,.45); }
`;
