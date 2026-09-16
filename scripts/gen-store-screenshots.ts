// Generates every image the Google Play listing needs, from the LIVE site.
//
//   npx tsx scripts/gen-store-screenshots.ts
//
// Output → mobile/store/assets/
//   phone-1..6.png     1080 x 1920   captioned phone screenshots (Play: 2-8)
//   feature-graphic.png 1024 x 500   required for the store listing
//   icon-512.png         512 x 512   required for the store listing
//
// Why screenshot the live site rather than an emulator: the app IS the live
// site in a native shell, so these are the real thing, with real prices and
// real cards — and this script can be re-run after any redesign instead of
// someone hand-capturing eight frames again. Nothing here touches a database;
// it is ordinary HTTP traffic to the public site, so it costs no Neon egress
// (see the rules at the top of src/lib/db.ts).
//
// Play's spec: each side 320-3840px, and 9:16 is the safe phone aspect. The
// captures are taken at a real phone viewport (390x844 @3x) and then composed
// onto an exact 1080x1920 canvas, so the page is never squashed to fit.
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { NATIVE_UA_TOKEN } from "../src/lib/native-boot";

const SITE = process.env.STORE_SHOT_ORIGIN ?? "https://riftcompare.com";
const OUT = "mobile/store/assets";

const INK = "#0a0f1a";
const INK_2 = "#111827";
const ACCENT = "#22c55e";
const FG = "#e5e9f0";
const MUTED = "#8b95a7";

// Device capture size (CSS px x DPR) and the frame it is drawn into.
const VW = 390;
const VH = 844;
const DPR = 3;

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const FRAME_W = 864; // device width inside the canvas
const FRAME_X = (CANVAS_W - FRAME_W) / 2;
const FRAME_Y = 430; // leaves room for the caption above
const FRAME_R = 52; // corner radius

type Shot = {
  /** File stem, e.g. "phone-1". */
  name: string;
  /** Path on the site. */
  path: string;
  /** Big line, kept short — Play crops the sides on small devices. */
  caption: string;
  /** Supporting line. */
  sub: string;
  /** Optional extra settle time for pages that stream in prices. */
  settleMs?: number;
  /**
   * Heading text to scroll to before capturing. Several of these pages lead
   * with a breadcrumb, a hero and an ad slot, so a naive top-of-page capture
   * shows chrome rather than the feature the caption is promising — the card
   * page's price table, the one screenshot that has to sell the app, sits about
   * 1,400px down.
   */
  scrollToText?: string;
};

const SHOTS: Shot[] = [
  {
    name: "phone-1",
    path: "/",
    caption: "Every Riftbound price,\none search",
    sub: "Live prices from stores in AU, US, UK and more",
  },
  {
    name: "phone-2",
    path: "/card/yasuo-unforgiven-ogn-305s-298",
    caption: "See who's cheapest\nbefore you buy",
    sub: "Every store's price for a card, side by side",
    scrollToText: "Price comparison",
    settleMs: 2500,
  },
  {
    name: "phone-3",
    path: "/movers",
    caption: "Catch a card\nbefore it spikes",
    sub: "The biggest risers and fallers, updated daily",
    scrollToText: "Spiking this week",
  },
  {
    name: "phone-4",
    path: "/sets/origins",
    caption: "The complete\ncard database",
    sub: "Every set, every printing, every price",
    scrollToText: "Riftbound Origins card list",
  },
  {
    name: "phone-5",
    path: "/sealed",
    caption: "Sealed product,\npriced per pack",
    sub: "Boxes and bundles compared on what they really cost",
    scrollToText: "Sealed Products",
  },
  {
    name: "phone-6",
    path: "/market",
    caption: "Track the whole\nmarket, not one card",
    sub: "The RiftCompare Index moves with the set",
    scrollToText: "The RiftCompare Index",
  },
];


// --- Local mirror -----------------------------------------------------------
//
// Headless Chromium here has no way to trust the sandbox's egress-inspection CA
// (it reads NSS, not the system store, and certutil isn't installed), so every
// direct https:// navigation fails with ERR_CERT_AUTHORITY_INVALID and renders
// a blank page. Rather than turn certificate checking off in the browser, this
// puts a plain-HTTP mirror on 127.0.0.1 in front of it: Node performs the real
// TLS handshake to the origin — verifying it properly against
// NODE_EXTRA_CA_CERTS — and Chromium only ever talks to localhost.
//
// It also drops CSP/HSTS on the way through (both would otherwise force the
// page back to https://riftcompare.com and out of the mirror) and rewrites
// same-site absolute URLs to the mirror's origin. Cross-origin assets are
// proxied through /__ext/<url> so card art from a CDN still appears.
const ORIGIN_HOST = new URL(SITE).host;

function rewriteBody(text: string, base: string): string {
  return (
    text
      // Same-site absolute URLs → the mirror.
      .replace(new RegExp(`https://(?:www\\.)?${ORIGIN_HOST.replace(/\./g, "\\.")}`, "g"), base)
      // Any other absolute https asset → through the mirror's external proxy,
      // so it is fetched by Node (which can verify it) instead of by Chromium.
      .replace(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})(\/[^"'\s)\\]*)?/gi, (m, host) =>
        host === ORIGIN_HOST || host === `www.${ORIGIN_HOST}` ? m : `${base}/__ext/${encodeURIComponent(m)}`
      )
  );
}

async function startMirror(): Promise<{ base: string; close: () => Promise<void> }> {
  const server: Server = createServer(async (req, res) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const raw = req.url ?? "/";
    let target: string;
    if (raw.startsWith("/__ext/")) {
      try {
        target = decodeURIComponent(raw.slice("/__ext/".length));
      } catch {
        res.writeHead(400).end("bad external url");
        return;
      }
    } else {
      target = `${SITE}${raw}`;
    }

    try {
      const upstream = await fetch(target, {
        headers: {
          "user-agent": req.headers["user-agent"] ?? "",
          accept: req.headers["accept"] ?? "*/*",
          "accept-language": "en-AU,en;q=0.9",
        },
        redirect: "follow",
      });

      const type = upstream.headers.get("content-type") ?? "application/octet-stream";
      const headers: Record<string, string> = { "content-type": type };
      const cc = upstream.headers.get("cache-control");
      if (cc) headers["cache-control"] = cc;

      // Rewrite only the text formats that can carry a URL. Images, fonts and
      // anything binary stream through untouched.
      if (/text\/html|text\/css|javascript|application\/json/i.test(type)) {
        const body = rewriteBody(await upstream.text(), base);
        res.writeHead(upstream.status, headers).end(body);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, headers).end(buf);
      }
    } catch (err) {
      res.writeHead(502).end(`mirror error: ${(err as Error).message}`);
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** XML-escape text destined for an SVG node. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The background + caption + device bezel for one screenshot, as SVG.
 *
 * The phone capture is composited INTO the cut-out rather than drawn here, so
 * this is pure chrome and can be tweaked without re-capturing the site.
 */
function frameSvg(shot: Shot): string {
  const lines = shot.caption.split("\n");
  const titleY = 150;
  const lineH = 78;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#0d1524"/>
      <stop offset="55%" stop-color="${INK}"/>
      <stop offset="100%" stop-color="#070b13"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.3" r="0.6">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#bg)"/>
  <rect width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#glow)"/>
  <g font-family="DejaVu Sans, Liberation Sans, sans-serif" text-anchor="middle">
    ${lines
      .map(
        (l, i) =>
          `<text x="${CANVAS_W / 2}" y="${titleY + i * lineH}" font-size="62" font-weight="bold" fill="${FG}">${esc(l)}</text>`
      )
      .join("\n    ")}
    <text x="${CANVAS_W / 2}" y="${titleY + lines.length * lineH + 18}" font-size="30" fill="${MUTED}">${esc(shot.sub)}</text>
  </g>
  <!-- Device bezel: drawn UNDER the capture, slightly larger, so the capture's
       rounded mask sits inside a visible edge. -->
  <rect x="${FRAME_X - 10}" y="${FRAME_Y - 10}" width="${FRAME_W + 20}" height="${CANVAS_H - FRAME_Y + 10}"
        rx="${FRAME_R + 10}" fill="${INK_2}" stroke="#263349" stroke-width="2"/>
</svg>`;
}

/** Round the corners of a captured page so it reads as a phone screen. */
async function roundCorners(buf: Buffer, w: number, h: number, r: number): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`
  );
  return sharp(buf)
    .resize(w, h, { fit: "cover", position: "top" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** Dismiss the cookie/consent and newsletter overlays so they don't eat a shot. */
async function dismissOverlays(page: Page): Promise<void> {
  const labels = [
    /accept/i,
    /agree/i,
    /got it/i,
    /^ok$/i,
    /dismiss/i,
    /close/i,
    /no thanks/i,
    /maybe later/i,
  ];
  for (const re of labels) {
    for (const role of ["button", "link"] as const) {
      const el = page.getByRole(role, { name: re }).first();
      try {
        if (await el.isVisible({ timeout: 250 })) {
          await el.click({ timeout: 1000 });
          await page.waitForTimeout(250);
        }
      } catch {
        /* not present on this page — that's the normal case */
      }
    }
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const mirror = await startMirror();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    // Carries NATIVE_UA_TOKEN, so the site renders exactly as it does INSIDE
    // the app: <html> gets the native class and AdSense is paused, which is
    // both what a store reviewer should see and what the user will actually
    // get. Without it the frames show web ad slots the app never displays.
    userAgent: `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 ${NATIVE_UA_TOKEN}`,
  });

  const frameInnerH = CANVAS_H - FRAME_Y;

  for (const shot of SHOTS) {
    const page = await ctx.newPage();
    const url = `${mirror.base}${shot.path}`;
    process.stdout.write(`capturing ${url} … `);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    } catch {
      // networkidle never settles on pages that poll; the load is still usable.
      await page.waitForTimeout(2_000);
    }
    await dismissOverlays(page);
    await page.waitForTimeout(shot.settleMs ?? 1_200);

    if (shot.scrollToText) {
      // Two passes on purpose. These pages lazy-load rows and card art as they
      // come into range, so the layout keeps moving for a second or so after
      // the first scroll — a single scrollTo reliably landed several hundred
      // pixels past the heading. Pass one gets us roughly there and triggers
      // that loading; pass two re-measures once it has settled and corrects.
      //
      // Also note this is a plain window.scrollTo rather than Playwright's
      // scrollIntoViewIfNeeded: the site sets `overflow: clip` on <html>, and
      // the CDP scroll-into-view backing that helper silently no-ops against
      // it — every capture came back pinned to the top.
      const scrollToHeading = (needle: string, offset: number) =>
        page.evaluate(
          ({ needle, offset }: { needle: string; offset: number }) => {
            const prev = document.documentElement.style.scrollBehavior;
            document.documentElement.style.scrollBehavior = "auto";
            const heading = Array.from(document.querySelectorAll("h1, h2, h3")).find((el) =>
              (el.textContent ?? "").toLowerCase().includes(needle.toLowerCase())
            );
            if (!heading) {
              document.documentElement.style.scrollBehavior = prev;
              return null;
            }
            const y = Math.max(0, heading.getBoundingClientRect().top + window.scrollY - offset);
            window.scrollTo(0, y);
            document.documentElement.style.scrollBehavior = prev;
            return { scrollY: Math.round(window.scrollY) };
          },
          { needle, offset }
        );

      // HEADER_CLEARANCE keeps the heading below the sticky top bar instead of
      // tucked underneath it.
      const HEADER_CLEARANCE = 150;
      const first = await scrollToHeading(shot.scrollToText, HEADER_CLEARANCE);
      if (!first) {
        console.warn(`  (no heading matching ${JSON.stringify(shot.scrollToText)} — capturing from the top)`);
      } else {
        await page.waitForTimeout(1_500);
        await scrollToHeading(shot.scrollToText, HEADER_CLEARANCE);
        await page.waitForTimeout(800);
        const check = await page.evaluate((needle: string) => {
          const heading = Array.from(document.querySelectorAll("h1, h2, h3")).find((el) =>
            (el.textContent ?? "").toLowerCase().includes(needle.toLowerCase())
          );
          return heading ? Math.round(heading.getBoundingClientRect().top) : null;
        }, shot.scrollToText);
        if (check === null || Math.abs(check - HEADER_CLEARANCE) > 120) {
          console.warn(`  (heading settled at ${check}px, wanted ~${HEADER_CLEARANCE}px)`);
        }
      }
    }

    const raw = (await page.screenshot({ type: "png" })) as Buffer;
    await page.close();

    const inner = await roundCorners(raw, FRAME_W, frameInnerH, FRAME_R);
    const out = await sharp(Buffer.from(frameSvg(shot)))
      .composite([{ input: inner, left: FRAME_X, top: FRAME_Y }])
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(join(OUT, `${shot.name}.png`), out);
    console.log(`→ ${shot.name}.png`);
  }

  await browser.close();
  await mirror.close();

  // --- Feature graphic: 1024x500, required by Play for the listing header ---
  const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1524"/>
      <stop offset="60%" stop-color="${INK}"/>
      <stop offset="100%" stop-color="#071019"/>
    </linearGradient>
    <radialGradient id="g" cx="0.78" cy="0.5" r="0.55">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#g)"/>
  <g font-family="DejaVu Sans, Liberation Sans, sans-serif">
    <text x="72" y="214" font-size="76" font-weight="bold" fill="${FG}">Rift<tspan fill="${ACCENT}">Compare</tspan></text>
    <text x="74" y="272" font-size="33" fill="${FG}">Find the cheapest Riftbound cards</text>
    <text x="74" y="322" font-size="26" fill="${MUTED}">Live prices compared across every store, updated daily</text>
    <g transform="translate(74,364)">
      <rect width="196" height="52" rx="26" fill="${ACCENT}"/>
      <text x="98" y="34" font-size="24" font-weight="bold" fill="#04120a" text-anchor="middle">Free to use</text>
    </g>
  </g>
</svg>`;
  await sharp(Buffer.from(feature)).png({ compressionLevel: 9 }).toFile(join(OUT, "feature-graphic.png"));
  console.log("→ feature-graphic.png (1024x500)");

  // --- Store icon: 512x512, flattened onto the brand background. Play rejects
  // an icon with alpha, so the transparent source is composited over ink. ---
  await sharp("mobile/resources/icon.png")
    .resize(512, 512, { fit: "contain", background: INK })
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, "icon-512.png"));
  console.log("→ icon-512.png (512x512)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
