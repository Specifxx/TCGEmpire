// An Instagram carousel (1080x1350 slides) from the same content as the video:
// a cover, the list in pages of five, and a closing slide with the link.
// social/render-slides.mjs screenshots every <section class="slide">.
import { STYLE, RASTERIZE, swirl, wordmark, esc } from "./style.mjs";

/**
 * cover: { kicker, title, title2?, ribbon, fan: [artSrc…] }
 * items: [{ art?, rank, name, meta, value, down? }]   (value is HTML)
 * pageTitle: heading on each list slide
 */
export function slidesHtml({ accent = "#34d17e", cover, items, pageTitle, cta, legal }) {
  // Five rows with card art fit a slide; six without.
  const per = items.some((it) => it.art) ? 5 : 6;
  const pages = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  const fan = cover.fan.slice(0, 3);
  const slide = (id, body, seed) => `<section class="slide" id="${id}">${swirl(30, seed)}${body}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>carousel</title>
<style>${STYLE}
:root { --accent: ${accent}; }
body { background: #222; }
.slide { position: relative; width: 1080px; height: 1350px; overflow: hidden; isolation: isolate; margin-bottom: 20px; background: var(--void); }
.slide .bg { animation: none; top: -300px; }
.fan { position: absolute; top: 640px; left: 0; right: 0; height: 520px; }
.fan .f { position: absolute; top: 0; width: 330px; height: 460px; border-radius: 20px; overflow: hidden; box-shadow: 0 0 0 3px rgba(255,207,90,.9), 0 30px 60px rgba(0,0,0,.7); }
.fan .f img { width: 100%; height: 100%; object-fit: cover; }
.list { position: absolute; left: 60px; right: 60px; top: 250px; }
.li { display: flex; align-items: center; gap: 24px; padding: 12px 22px; margin-bottom: 16px; border-radius: 18px; background: rgba(5,7,15,.86); border: 2px solid rgba(212,169,79,.5); height: 170px; }
.li.flat { height: 140px; }
.li .rk { width: 128px; flex: none; font-family: "Anton"; font-size: 50px; color: var(--gold); text-align: center; }
.li .th { width: 104px; height: 145px; border-radius: 8px; overflow: hidden; flex: none; box-shadow: 0 0 0 2px rgba(255,207,90,.7); }
.li .th img { width: 100%; height: 100%; object-fit: cover; }
.li .nm { flex: 1; font-size: 32px; font-weight: 900; color: #fff; line-height: 1.12; }
.li .nm small { display: block; margin-top: 6px; font-family: "Cinzel"; font-size: 21px; letter-spacing: 2px; color: var(--gold); }
.li .vl { text-align: right; font-family: "Anton"; font-size: 54px; color: var(--accent); line-height: 1.05; }
.li .vl small { display: block; font-family: "Montserrat"; font-weight: 700; font-size: 22px; color: var(--muted); }
.foot { position: absolute; left: 60px; right: 60px; bottom: 40px; display: flex; justify-content: space-between; align-items: center; font-size: 24px; font-weight: 700; color: var(--muted); }
.foot b { color: #fff; font-size: 30px; }
</style></head><body>
${slide("s1", `
  <div class="abs center" style="top: 70px;">${wordmark(70)}</div>
  <div class="abs center cinzel" style="top: 200px; font-size: 44px; color: #fff; letter-spacing: 10px;">${esc(cover.kicker)}</div>
  <div class="abs center hot" style="top: 270px; font-size: ${cover.titleSize ?? 170}px; line-height: .92;">${esc(cover.title)}</div>
  ${cover.title2 ? `<div class="abs center outline" style="top: ${cover.title2Top ?? 470}px; font-size: ${cover.title2Size ?? 104}px;">${esc(cover.title2)}</div>` : ""}
  <div class="fan">${fan.map((src, i) => {
    const pos = fan.length === 1 ? [375] : fan.length === 2 ? [215, 535] : [95, 375, 655];
    const rot = fan.length === 3 ? [-8, 0, 8][i] : 0;
    return `<div class="f" style="left:${pos[i]}px; transform: rotate(${rot}deg) translateY(${rot ? 30 : 0}px); z-index:${i === 1 ? 2 : 1}"><img src="${esc(src)}"></div>`;
  }).join("")}</div>
  <div class="abs center" style="top: 1190px;"><span class="ribbon">${esc(cover.ribbon)}</span></div>
`, 7)}
${pages.map((p, n) => slide(`s${n + 2}`, `
  <div class="abs center outline" style="top: 90px; font-size: 76px;">${esc(pageTitle)}</div>
  <div class="list">${p.map((it) => `<div class="li${it.art ? "" : " flat"}"${it.down ? ' style="--accent: var(--down)"' : ""}>
    <span class="rk">${esc(it.rank)}</span>
    ${it.art ? `<span class="th"><img src="${esc(it.art)}"></span>` : ""}
    <span class="nm">${esc(it.name)}<small>${esc(it.meta)}</small></span>
    <span class="vl">${it.value}</span>
  </div>`).join("")}</div>
  <div class="foot"><b>riftcompare.com</b><span>${n + 2} / ${pages.length + 2}</span></div>
`, 11 + n)).join("\n")}
${slide(`s${pages.length + 2}`, `
  <div class="abs center" style="top: 330px;">${wordmark(130)}</div>
  <div class="abs center cinzel" style="top: 480px; font-size: 40px; color: #fff; letter-spacing: 6px;">RIFTBOUND <span style="color: var(--gold); font-size: 28px;">PRICE</span> TRACKER</div>
  <div class="abs center" style="top: 600px; left: 70px; right: 70px; font-size: 50px; font-weight: 900; line-height: 1.2;">${cta}</div>
  <div class="abs center" style="top: 840px;"><span class="cta" style="font-size: 58px;">riftcompare.com</span></div>
  <div class="abs center small" style="top: 1010px; font-size: 32px; color: var(--accent);">Free · link in bio</div>
  <div class="abs center small" style="left: 80px; right: 80px; top: 1140px; font-size: 21px; line-height: 1.45; color: #8e9ab0;">${esc(legal)}</div>
`, 23)}
${RASTERIZE}
</body></html>`;
}
