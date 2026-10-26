// Profile art for every channel: avatar (1080×1080; platforms crop it to a
// circle), YouTube banner (2560×1440; only the centre 1546×423 shows on every
// device) and a TikTok/Instagram-safe cover. Then render-slides draws the PNGs:
//   node social/profile.mjs && node social/render-slides.mjs social/out/profile
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/data.mjs";
import { STYLE, RASTERIZE, swirl, wordmark } from "./lib/style.mjs";

const dir = path.join(ROOT, "social/out/profile");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "slides.html"), `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}
:root { --accent: #34d17e; }
.slide { position: relative; overflow: hidden; isolation: isolate; background: var(--void); margin-bottom: 20px; }
.slide .bg { animation: none; }
.mark { display: block; background: linear-gradient(180deg, #ffe27a 0%, #ffb02e 40%, #ff7a1a 72%, #e2550c 100%); }
</style></head><body>
<section class="slide" id="avatar" style="width:1080px;height:1080px">${swirl(30, 3)}
  <div class="abs" style="left:50%;top:50%;width:1000px;height:1000px;margin:-500px 0 0 -500px;border-radius:50%;background:radial-gradient(circle, rgba(5,7,15,.2), rgba(5,7,15,.85) 70%);"></div>
  <span class="rmark abs" style="left:270px;top:250px;width:560px;height:550px;filter:drop-shadow(0 12px 0 #6a1a00) drop-shadow(0 0 60px rgba(255,140,40,.55));"></span>
</section>
<section class="slide" id="banner" style="width:2560px;height:1440px">${swirl(30, 9).replace(`class="bg"`, `class="bg" style="left:0;top:0;width:2560px;height:1440px"`)}
  <div class="abs center" style="top:560px;">${wordmark(190)}</div>
  <div class="abs center cinzel" style="top:770px;font-size:58px;color:#fff;letter-spacing:10px;">RIFTBOUND <span style="color:var(--gold);font-size:40px;">PRICE</span> TRACKER</div>
  <div class="abs center" style="top:860px;font-size:44px;font-weight:800;color:var(--rc-green);">Every card · 230+ stores · weekly price movers</div>
</section>
${RASTERIZE}
</body></html>`);
console.log(dir);
