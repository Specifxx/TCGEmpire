"use client";

import { useEffect, useRef } from "react";

// The homepage hero's rift embers (owner, 2026-10-16: "some cool animated
// stuff … glowing … particles … interactive"). Sparks in the Riftbound orange
// and gold, with a few hextech-blue motes, drift up through the hero. They part
// around the pointer, a soft glow follows it, and a click or tap throws a burst
// of sparks.
//
// Halloween (html[data-season="halloween"], lib/season.ts; owner: "Nocturne is
// going to come get you"): violet and ghost-blue wisps join the embers, the
// hero sits in Nocturne's dark with the pointer as the only light, his eyes
// open somewhere in the dark (and are gone the moment the light reaches
// them), bats cross the sky now and then (and burst out of a click), and a
// spider hangs from each corner cobweb (HalloweenDecor), scuttling up its
// thread when the pointer comes near and creeping back down after.
//
// Built so it costs the page nothing it cares about:
//   - pure decoration on a <canvas> behind the content, aria-hidden and
//     pointer-events:none; the pointer listeners sit on the hero section,
//     passive, so links and the search box behave exactly as before;
//   - starts on idle after load, so it never competes with the LCP headline;
//   - draws only while the hero is on screen and the tab is visible;
//   - prefers-reduced-motion paints one still frame and stops;
//   - no library: one rAF loop over ~36-150 sprites.

type Theme = "dark" | "light";
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: number; // index into the palette
  phase: number;
  sway: number;
  life: number; // sparks only: frames left; Infinity for drifting embers
  max: number;
}
interface Bat {
  x: number;
  y: number;
  vx: number;
  size: number;
  phase: number;
  bob: number;
}
interface Spider {
  ax: number; // thread's x
  oy: number; // where the thread leaves the web
  len: number; // current thread length
  rest: number; // the length it creeps back down to
  phase: number;
  scaredUntil: number;
}
interface Eyes {
  x: number;
  y: number;
  a: number; // current opacity
  target: number;
  until: number; // t at which they close
  next: number; // t at which the next pair opens
  blinkAt: number;
}

// [rgb, weight] per palette entry; weights pick a mote's colour.
const PALETTES: Record<"rift" | "halloween", Record<Theme, [string, number][]>> = {
  rift: {
    dark: [["239,125,0", 0.68], ["242,180,90", 0.22], ["56,189,248", 0.1]],
    light: [["224,111,0", 0.68], ["184,134,42", 0.22], ["3,105,161", 0.1]],
  },
  halloween: {
    dark: [["239,125,0", 0.4], ["167,139,250", 0.32], ["125,211,252", 0.14], ["242,180,90", 0.14]],
    light: [["224,111,0", 0.42], ["109,40,217", 0.34], ["3,105,161", 0.12], ["184,134,42", 0.12]],
  },
};

function sprite(rgb: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(255,248,235,1)`);
  grad.addColorStop(0.12, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.4, `rgba(${rgb},0.28)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

export function RiftEmbers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.closest("section") as HTMLElement | null;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    let theme: Theme = "dark";
    let halloween = false;
    let palette: [string, number][] = [];
    let sprites: HTMLCanvasElement[] = [];
    const readMode = () => {
      theme = root.getAttribute("data-theme") === "light" ? "light" : "dark";
      halloween = root.getAttribute("data-season") === "halloween";
      palette = PALETTES[halloween ? "halloween" : "rift"][theme];
      sprites = palette.map(([rgb]) => sprite(rgb));
    };
    readMode();

    let w = 0;
    let h = 0;
    let dpr = 1;
    // The hero runs the full window width, but from lg the side rail covers
    // its left edge (--sidenav-w). Anything that has to be SEEN (the eyes, the
    // centre of the dark) is placed in the visible part, from x0 to w.
    let x0 = 0;
    let motes: Mote[] = [];
    let bats: Bat[] = [];
    let spiders: Spider[] = [];
    let nextBat = 240;
    const eyes: Eyes = { x: 0, y: 0, a: 0, target: 0, until: 0, next: 120, blinkAt: 0 };
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0, lastSpark: 0 };

    const pickKind = (): number => {
      let r = Math.random();
      for (let i = 0; i < palette.length; i++) {
        r -= palette[i][1];
        if (r <= 0) return i;
      }
      return 0;
    };
    const ember = (spawnBelow: boolean): Mote => ({
      x: Math.random() * w,
      y: spawnBelow ? h + Math.random() * 40 : Math.random() * h,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(0.18 + Math.random() * 0.5),
      // One in twelve is a big, bright ember; the rest are fine sparks.
      r: Math.random() < 0.08 ? 2.6 + Math.random() * 1.4 : 0.7 + Math.random() * 1.9,
      kind: pickKind(),
      phase: Math.random() * Math.PI * 2,
      sway: 0.15 + Math.random() * 0.35,
      life: Infinity,
      max: Infinity,
    });
    const spark = (x: number, y: number, speed: number): Mote => {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const life = 40 + Math.random() * 40;
      return {
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.4,
        r: 0.6 + Math.random() * 1.4,
        kind: halloween ? (Math.random() < 0.5 ? 0 : 1) : Math.random() < 0.75 ? 0 : 1,
        phase: Math.random() * Math.PI * 2,
        sway: 0,
        life,
        max: life,
      };
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rail = getComputedStyle(root).getPropertyValue("--sidenav-w").trim();
      const remPx = parseFloat(getComputedStyle(root).fontSize) || 16;
      x0 = rail.endsWith("rem") ? parseFloat(rail) * remPx : parseFloat(rail) || 0;
      const want = Math.max(36, Math.min(150, Math.round((w * h) / 8000)));
      const embers = motes.filter((m) => m.life === Infinity);
      const sparks = motes.filter((m) => m.life !== Infinity);
      while (embers.length < want) embers.push(ember(false));
      embers.length = want;
      motes = embers.concat(sparks);
      // One spider under each corner web (globals.css .rb-web: clamp(92px,
      // 13vw, 200px) wide), hanging from about a third of the way into it.
      const web = Math.min(200, Math.max(92, window.innerWidth * 0.13));
      const small = w < 640;
      spiders = [
        { ax: x0 + web * 0.42, oy: web * 0.3, rest: (small ? 46 : 80) + Math.random() * (small ? 20 : 50) },
        { ax: w - web * 0.5, oy: web * 0.36, rest: (small ? 70 : 120) + Math.random() * (small ? 30 : 70) },
      ].map((sp, i) => ({ ...sp, len: spiders[i]?.len ?? sp.rest, phase: Math.random() * Math.PI * 2, scaredUntil: 0 }));
      if (!pointer.on) {
        pointer.x = pointer.tx = (x0 + w) / 2;
        pointer.y = pointer.ty = h * 0.35;
      }
    };

    // ── Halloween pieces ────────────────────────────────────────────────────
    // Nocturne's dark: the hero's edges in shadow, with a pool of light around
    // the pointer cut out of it (destination-out), drawn BEFORE the embers so
    // they still glow inside the dark.
    const drawDark = () => {
      if (theme !== "dark") return;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const cx = (x0 + w) / 2;
      const vw = w - x0;
      const g = ctx.createRadialGradient(cx, h * 0.4, Math.min(vw, h) * 0.2, cx, h * 0.4, Math.max(vw, h) * 0.7);
      g.addColorStop(0, "rgba(6,3,14,0)");
      g.addColorStop(1, "rgba(6,3,14,0.78)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (pointer.on > 0.01) {
        ctx.globalCompositeOperation = "destination-out";
        const R = 230;
        const l = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, R);
        l.addColorStop(0, `rgba(0,0,0,${0.85 * pointer.on})`);
        l.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = l;
        ctx.fillRect(pointer.x - R, pointer.y - R, R * 2, R * 2);
        ctx.globalCompositeOperation = "source-over";
      }
    };

    // His eyes open in the dark, away from the light, blink once, and close.
    // If the light comes within reach they are gone at once.
    const drawEyes = (dt: number) => {
      // On a phone the hero's content runs edge to edge, so there is no dark
      // margin for them to open in; they would peer out from behind the chips.
      if (w < 640) return;
      if (t >= eyes.next && eyes.target === 0 && eyes.a < 0.02) {
        // Somewhere in the outer thirds, upper two-thirds of the hero, and not
        // where the pointer is.
        for (let tries = 0; tries < 8; tries++) {
          const side = Math.random() < 0.5 ? 0.05 + Math.random() * 0.17 : 0.78 + Math.random() * 0.17;
          const x = x0 + (w - x0) * side;
          const y = h * (0.15 + Math.random() * 0.5);
          if (pointer.on < 0.1 || Math.hypot(x - pointer.x, y - pointer.y) > 300) {
            eyes.x = x;
            eyes.y = y;
            eyes.target = 1;
            eyes.until = t + 260 + Math.random() * 120;
            eyes.blinkAt = t + 110 + Math.random() * 60;
            break;
          }
        }
      }
      if (eyes.target === 1 && (t >= eyes.until || (pointer.on > 0.3 && Math.hypot(eyes.x - pointer.x, eyes.y - pointer.y) < 230))) {
        const fled = t < eyes.until;
        eyes.target = 0;
        eyes.next = t + (fled ? 200 : 240) + Math.random() * 200;
      }
      const rate = eyes.target === 1 ? 0.025 : 0.08; // they open slowly and vanish fast
      eyes.a += (eyes.target - eyes.a) * rate * dt;
      if (eyes.a < 0.01) return;
      const blink = Math.abs(t - eyes.blinkAt) < 5 ? 0.12 : 1;
      ctx.save();
      // A pool of shadow first, so the eyes sit in a face you cannot see.
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = eyes.a * (theme === "dark" ? 0.7 : 0.25);
      const shade = ctx.createRadialGradient(eyes.x, eyes.y + 6, 0, eyes.x, eyes.y + 6, 90);
      shade.addColorStop(0, theme === "dark" ? "rgba(3,1,8,1)" : "rgba(46,16,101,0.6)");
      shade.addColorStop(1, "rgba(3,1,8,0)");
      ctx.fillStyle = shade;
      ctx.fillRect(eyes.x - 90, eyes.y - 84, 180, 180);
      ctx.globalCompositeOperation = theme === "dark" ? "lighter" : "source-over";
      ctx.globalAlpha = eyes.a * (theme === "dark" ? 1 : 0.85);
      ctx.shadowColor = theme === "dark" ? "rgba(56,189,248,1)" : "rgba(76,29,149,0.7)";
      ctx.fillStyle = theme === "dark" ? "#e0f2fe" : "#3b0764";
      // Twice: a wide halo, then a tight bright core.
      for (const blur of [26, 8]) {
        ctx.shadowBlur = blur;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(eyes.x + s * 21, eyes.y, 13, 4.6 * blink, s * -0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    // Bats now and then: a few silhouettes flapping across the sky.
    const drawBats = (dt: number) => {
      if (t >= nextBat) {
        const n = 1 + Math.floor(Math.random() * 3);
        const fromLeft = Math.random() < 0.5;
        const y0 = h * (0.08 + Math.random() * 0.3);
        for (let i = 0; i < n; i++) {
          bats.push({
            x: fromLeft ? -40 - i * 50 : w + 40 + i * 50,
            y: y0 + (Math.random() - 0.5) * 60,
            vx: (fromLeft ? 1 : -1) * (2.2 + Math.random() * 1.2),
            size: 9 + Math.random() * 8,
            phase: Math.random() * Math.PI * 2,
            bob: 0.6 + Math.random() * 0.8,
          });
        }
        nextBat = t + 520 + Math.random() * 420;
      }
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = theme === "dark" ? 0.92 : 0.7;
      ctx.fillStyle = theme === "dark" ? "#120a22" : "#3b1d6e";
      ctx.shadowColor = theme === "dark" ? "rgba(167,139,250,0.7)" : "rgba(0,0,0,0)";
      ctx.shadowBlur = theme === "dark" ? 6 : 0;
      for (let i = bats.length - 1; i >= 0; i--) {
        const b = bats[i];
        b.x += b.vx * dt;
        b.y += Math.sin(t * 0.08 + b.phase) * b.bob * dt;
        if (b.x < -120 || b.x > w + 120) {
          bats.splice(i, 1);
          continue;
        }
        const s = b.size;
        const flap = Math.sin(t * 0.45 + b.phase); // -1..1
        const tip = -s * 0.2 - flap * s * 0.75; // wingtip height
        const dir = b.vx > 0 ? 1 : -1;
        ctx.beginPath();
        // Left wing, body, right wing, as one scalloped silhouette.
        ctx.moveTo(b.x, b.y);
        ctx.quadraticCurveTo(b.x - s * 0.5, b.y + tip * 0.4, b.x - s * 1.6, b.y + tip);
        ctx.quadraticCurveTo(b.x - s * 1.1, b.y + s * 0.15, b.x - s * 0.9, b.y + s * 0.35);
        ctx.quadraticCurveTo(b.x - s * 0.5, b.y + s * 0.1, b.x - s * 0.3, b.y + s * 0.45);
        ctx.quadraticCurveTo(b.x, b.y + s * 0.3, b.x + s * 0.3, b.y + s * 0.45);
        ctx.quadraticCurveTo(b.x + s * 0.5, b.y + s * 0.1, b.x + s * 0.9, b.y + s * 0.35);
        ctx.quadraticCurveTo(b.x + s * 1.1, b.y + s * 0.15, b.x + s * 1.6, b.y + tip);
        ctx.quadraticCurveTo(b.x + s * 0.5, b.y + tip * 0.4, b.x, b.y);
        ctx.fill();
        // Head with two ears, leaning the way it flies.
        ctx.beginPath();
        ctx.ellipse(b.x + dir * s * 0.05, b.y + s * 0.05, s * 0.22, s * 0.3, 0, 0, Math.PI * 2);
        ctx.moveTo(b.x - s * 0.15, b.y - s * 0.15);
        ctx.lineTo(b.x - s * 0.1, b.y - s * 0.45);
        ctx.lineTo(b.x, b.y - s * 0.2);
        ctx.lineTo(b.x + s * 0.1, b.y - s * 0.45);
        ctx.lineTo(b.x + s * 0.15, b.y - s * 0.15);
        ctx.fill();
      }
      ctx.restore();
    };

    // A spider on its silk: it bobs, and bolts up the thread if the pointer
    // comes within reach, then creeps back down to where it was.
    const drawSpiders = (dt: number) => {
      const k = w < 640 ? 0.8 : 1;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      for (const sp of spiders) {
        const bodyY = sp.oy + sp.len;
        if (pointer.on > 0.2 && Math.hypot(pointer.x - sp.ax, pointer.y - bodyY) < 130) sp.scaredUntil = t + 110;
        const target = t < sp.scaredUntil ? 4 : sp.rest + Math.sin(t * 0.03 + sp.phase) * 9;
        sp.len += (target - sp.len) * (target < sp.len ? 0.16 : 0.012) * dt;
        const y = sp.oy + sp.len;
        const x = sp.ax + Math.sin(t * 0.02 + sp.phase) * 2.5;
        // The thread.
        ctx.strokeStyle = theme === "dark" ? "rgba(225,220,255,0.45)" : "rgba(60,40,110,0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sp.ax, sp.oy);
        ctx.lineTo(x, y - 9 * k);
        ctx.stroke();
        // Eight legs, four a side, twitching.
        ctx.strokeStyle = theme === "dark" ? "#120a22" : "#2a1650";
        ctx.lineWidth = 1.5 * k;
        ctx.shadowColor = theme === "dark" ? "rgba(167,139,250,0.65)" : "rgba(0,0,0,0)";
        ctx.shadowBlur = theme === "dark" ? 5 : 0;
        for (const side of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const wig = Math.sin(t * 0.25 + i * 1.3 + side) * (t < sp.scaredUntil ? 2.2 : 0.8);
            ctx.beginPath();
            ctx.moveTo(x + side * 2.5 * k, y + (i * 1.6 - 1) * k);
            ctx.lineTo(x + side * (9 + i * 1.3) * k, y + (-6 + i * 3.4 + wig) * k);
            ctx.lineTo(x + side * (13 + i * 1.6) * k, y + (3 + i * 4.4 + wig) * k);
            ctx.stroke();
          }
        }
        // Abdomen (up, on the thread), head (down), two ember eyes.
        ctx.fillStyle = theme === "dark" ? "#120a22" : "#2a1650";
        ctx.beginPath();
        ctx.ellipse(x, y - 4 * k, 6.2 * k, 7.6 * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y + 5 * k, 4 * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "rgba(255,90,40,0.9)";
        ctx.shadowBlur = 4;
        ctx.fillStyle = "#ff6a3d";
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(x + side * 1.6 * k, y + 6.3 * k, 0.95 * k, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    };

    let t = 0;
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);

      // The glow that follows the pointer, easing in and out as it arrives/leaves.
      pointer.on += (pointer.target - pointer.on) * 0.06 * dt;
      pointer.x += (pointer.tx - pointer.x) * 0.08 * dt;
      pointer.y += (pointer.ty - pointer.y) * 0.08 * dt;

      if (halloween) drawDark();

      ctx.globalCompositeOperation = theme === "dark" ? "lighter" : "source-over";
      if (pointer.on > 0.01) {
        const R = 260;
        ctx.globalAlpha = (theme === "dark" ? 0.2 : 0.12) * pointer.on;
        ctx.drawImage(sprites[0], pointer.x - R, pointer.y - R, R * 2, R * 2);
      }

      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        // Part around the pointer.
        if (pointer.on > 0.05) {
          const dx = m.x - pointer.x;
          const dy = m.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 140 * 140 && d2 > 1) {
            const d = Math.sqrt(d2);
            const f = (1 - d / 140) ** 2 * 0.9 * pointer.on;
            m.x += (dx / d) * f * dt;
            m.y += (dy / d) * f * dt;
          }
        }
        m.x += (m.vx + Math.sin(t * 0.02 + m.phase) * m.sway * 0.3) * dt;
        m.y += m.vy * dt;

        let alpha: number;
        if (m.life === Infinity) {
          // Fade in over the bottom 60px, out over the top third, and flicker.
          const fromBottom = Math.max(0, Math.min(1, (h - m.y) / 60));
          const fromTop = Math.max(0, Math.min(1, m.y / (h * 0.33)));
          alpha = fromBottom * fromTop * (0.55 + 0.45 * Math.sin(t * 0.05 + m.phase * 3));
          if (m.y < -20 || m.x < -30 || m.x > w + 30) Object.assign(m, ember(true));
        } else {
          m.vy += 0.004 * dt; // sparks slow, then fall back a little
          m.vx *= 0.985;
          m.life -= dt;
          alpha = Math.max(0, m.life / m.max);
          if (m.life <= 0) {
            motes.splice(i, 1);
            continue;
          }
        }
        const size = m.r * 8;
        ctx.globalAlpha = alpha * (theme === "dark" ? 1 : 0.75);
        ctx.drawImage(sprites[m.kind % sprites.length], m.x - size / 2, m.y - size / 2, size, size);
      }

      if (halloween) {
        drawSpiders(dt);
        if (!reduced) {
          drawBats(dt);
          drawEyes(dt);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    let raf = 0;
    let last = 0;
    let visible = true;
    const loop = (now: number) => {
      const dt = last ? Math.min(3, (now - last) / 16.67) : 1;
      last = now;
      t += dt;
      draw(dt);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (raf || reduced || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    // Pointer position in the canvas's own coordinates. The canvas drifts with
    // the scroll parallax (.rb-depth-mid), so measure it, not the section.
    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      pointer.tx = p.x;
      pointer.ty = p.y;
      pointer.target = 1;
      if (pointer.on < 0.05) {
        pointer.x = p.x;
        pointer.y = p.y;
      }
      const now = performance.now();
      if (now - pointer.lastSpark > 45 && motes.length < 220) {
        pointer.lastSpark = now;
        motes.push(spark(p.x, p.y, 0.6));
      }
    };
    const onLeave = () => {
      pointer.target = 0;
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e);
      for (let i = 0; i < 22 && motes.length < 260; i++) motes.push(spark(p.x, p.y, 2.6));
      // In the season a click also lets a couple of bats out, one each way.
      if (halloween && bats.length < 12) {
        for (const dir of [-1, 1]) {
          bats.push({ x: p.x, y: p.y, vx: dir * (2.6 + Math.random() * 1.4), size: 8 + Math.random() * 5, phase: Math.random() * Math.PI * 2, bob: 0.8 + Math.random() * 0.6 });
        }
      }
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(1);
    });
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    const onVisibility = () => (document.hidden ? stop() : start());
    const mo = new MutationObserver(() => {
      const before = `${theme}/${halloween}`;
      readMode();
      if (`${theme}/${halloween}` !== before) {
        for (const m of motes) m.kind = pickKind();
        if (reduced) draw(1);
      }
    });

    resize();
    if (reduced) {
      draw(1); // one still frame: the embers are there, nothing moves
    } else {
      host.addEventListener("pointermove", onMove, { passive: true });
      host.addEventListener("pointerleave", onLeave, { passive: true });
      host.addEventListener("pointerdown", onDown, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
    }
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-season"] });

    // Start once the page is idle, so the first paint is the content's alone.
    type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const win = window as IdleWindow;
    const idle = win.requestIdleCallback ? win.requestIdleCallback(() => io.observe(host), { timeout: 1500 }) : window.setTimeout(() => io.observe(host), 300);

    return () => {
      stop();
      if (win.cancelIdleCallback) win.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="rb-depth-mid pointer-events-none absolute inset-0 h-full w-full" />;
}
