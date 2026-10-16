"use client";

import { useEffect, useRef } from "react";

// The homepage hero's rift embers (owner, 2026-10-16: "some cool animated
// stuff … glowing … particles … interactive"). Sparks in the Riftbound orange
// and gold, with a few hextech-blue motes, drift up through the hero. They part
// around the pointer, a soft glow follows it, and a click or tap throws a burst
// of sparks.
//
// Built so it costs the page nothing it cares about:
//   - pure decoration on a <canvas> behind the content, aria-hidden and
//     pointer-events:none; the pointer listeners sit on the hero section,
//     passive, so links and the search box behave exactly as before;
//   - starts on idle after load, so it never competes with the LCP headline;
//   - draws only while the hero is on screen and the tab is visible;
//   - prefers-reduced-motion paints one still frame and stops;
//   - no library: one rAF loop over ~36-150 sprites.

type Kind = 0 | 1 | 2; // orange, gold, teal
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: Kind;
  phase: number;
  sway: number;
  life: number; // sparks only: frames left; Infinity for drifting embers
  max: number;
}

const COLORS: Record<"dark" | "light", [string, string, string]> = {
  dark: ["239,125,0", "242,180,90", "56,189,248"],
  light: ["224,111,0", "184,134,42", "3,105,161"],
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
    let theme: "dark" | "light" = root.getAttribute("data-theme") === "light" ? "light" : "dark";
    let sprites = COLORS[theme].map(sprite);

    let w = 0;
    let h = 0;
    let dpr = 1;
    let motes: Mote[] = [];
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, on: 0, target: 0, lastSpark: 0 };

    const pickKind = (): Kind => {
      const r = Math.random();
      return r < 0.68 ? 0 : r < 0.9 ? 1 : 2;
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
        kind: Math.random() < 0.75 ? 0 : 1,
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
      const want = Math.max(36, Math.min(150, Math.round((w * h) / 8000)));
      const embers = motes.filter((m) => m.life === Infinity);
      const sparks = motes.filter((m) => m.life !== Infinity);
      while (embers.length < want) embers.push(ember(false));
      embers.length = want;
      motes = embers.concat(sparks);
      if (!pointer.on) {
        pointer.x = pointer.tx = w / 2;
        pointer.y = pointer.ty = h * 0.35;
      }
    };

    let t = 0;
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = theme === "dark" ? "lighter" : "source-over";

      // The glow that follows the pointer, easing in and out as it arrives/leaves.
      pointer.on += (pointer.target - pointer.on) * 0.06 * dt;
      pointer.x += (pointer.tx - pointer.x) * 0.08 * dt;
      pointer.y += (pointer.ty - pointer.y) * 0.08 * dt;
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
        ctx.drawImage(sprites[m.kind], m.x - size / 2, m.y - size / 2, size, size);
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

    const local = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
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
      const next = root.getAttribute("data-theme") === "light" ? "light" : "dark";
      if (next !== theme) {
        theme = next;
        sprites = COLORS[theme].map(sprite);
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
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

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

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
