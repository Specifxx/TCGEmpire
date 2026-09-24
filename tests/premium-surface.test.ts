import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPremiumClickSource, isPremiumSurface, rememberPremiumSurface, recallPremiumSurface } from "../src/lib/premium-surface";
import { surfaceTables } from "../src/lib/funnel-surfaces";

// Every Premium click names the surface it came from, and the surface rides
// into checkout and onto the Stripe subscription. DECISIONS.md, "Premium after
// sign-up: the post-signup funnel", 2026-09-23. Before this, the slide-in and
// every nav link were one "button" bucket and every tool gate was "dialog", so
// nothing could say whether the slide-in works.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

test("the allow-list takes the historic sources, the new surfaces, and nothing else", () => {
  for (const ok of ["dialog", "checkout", "premium-page", "button", "recovery", "offer", "slidein", "checklist", "welcome-email", "nav:navbar", "gate:deal-finder", "nudge:watchlist"]) {
    assert.ok(isPremiumClickSource(ok), `${ok} must be accepted`);
  }
  for (const bad of ["", "gate:", "gate:Deal Finder", "evil:x", "nav:" + "x".repeat(33), "<script>", 42, null, undefined]) {
    assert.ok(!isPremiumClickSource(bad), `${String(bad)} must be rejected`);
  }
});

test("purchase steps never count as the surface that sent someone", () => {
  for (const step of ["checkout", "premium-page", "dialog", "button"]) {
    assert.ok(!isPremiumSurface(step), `${step} is a step or a catch-all, not a surface`);
  }
  assert.ok(isPremiumSurface("slidein"));
  assert.ok(isPremiumSurface("gate:rising"));
});

test("remember/recall: a surface survives, a step cannot overwrite it, junk is refused", () => {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  try {
    assert.equal(recallPremiumSurface(), null);
    rememberPremiumSurface("slidein");
    assert.equal(recallPremiumSurface(), "slidein");
    rememberPremiumSurface("premium-page"); // pressing /premium's buy button
    assert.equal(recallPremiumSurface(), "slidein", "the page's own button must not overwrite the surface that sent them");
    rememberPremiumSurface("gate:deal-finder");
    assert.equal(recallPremiumSurface(), "gate:deal-finder", "the most recent real surface wins");
    store.set("rc_premium_surface", "tampered value");
    assert.equal(recallPremiumSurface(), null, "a tampered value is not trusted on the way out");
  } finally {
    delete (globalThis as any).window;
  }
});

test("every PremiumButton and PremiumNavLink in the app names its surface", () => {
  const files = [...walk(join(process.cwd(), "src/app")), ...walk(join(process.cwd(), "src/components"))];
  const unnamed: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/<(PremiumButton|PremiumNavLink)\b([^>]*)>/g)) {
      if (!/\bsurface=/.test(m[2])) unnamed.push(`${f.replace(process.cwd() + "/", "")}: <${m[1]}${m[2].slice(0, 40)}…>`);
    }
  }
  assert.deepEqual(unnamed, [], "a Premium CTA without a surface records the catch-all and cannot be measured");
});

test("the slide-in, the dialog and the landing beacon record their own sources", () => {
  assert.match(read("src/components/PremiumSlideIn.tsx"), /firePremiumClickBeacon\("slidein"\)/);
  assert.match(read("src/components/PremiumDialog.tsx"), /firePremiumClickBeacon\(surface \?\? "dialog"\)/);
  const beacon = read("src/components/PremiumRecoveryBeacon.tsx");
  assert.match(beacon, /src === "welcome"\) firePremiumClickBeacon\("welcome-email"\)/);
  assert.match(read("src/lib/analytics.ts"), /rememberPremiumSurface\(source\)/, "a click remembers its surface for checkout");
});

test("all three checkout callers send the remembered surface, and the route validates and stamps it", () => {
  for (const f of ["src/components/PremiumDialog.tsx", "src/components/PremiumCta.tsx", "src/components/CheckoutLauncher.tsx"]) {
    assert.match(read(f), /surface: recallPremiumSurface\(\)/, `${f} must send the surface with the checkout request`);
  }
  const route = read("src/app/api/premium/checkout/route.ts");
  assert.match(route, /const surface = isPremiumSurface\(body\?\.surface\)/, "validated before it touches the DB or Stripe");
  assert.match(route, /premiumClick\.create\(\{ data: \{ userId: user\.id, source: "checkout", surface \} \}\)/);
  assert.equal((route.match(/\.\.\.surfaceMeta/g) ?? []).length, 2, "on the session AND the subscription metadata");
  assert.match(read("prisma/schema.prisma"), /model PremiumClick \{[\s\S]*?surface\s+String\?/, "additive, nullable column");
});

test("the funnel report's surface tables", () => {
  const since = Date.UTC(2026, 8, 1);
  const now = Date.UTC(2026, 8, 30);
  const d = (day: number) => new Date(Date.UTC(2026, 8, day));
  const t = surfaceTables(
    [
      { createdAt: d(2), source: "slidein", surface: null },
      { createdAt: d(3), source: "slidein", surface: null },
      { createdAt: d(3), source: "gate:rising", surface: null },
      { createdAt: d(4), source: "checkout", surface: "slidein" },
      { createdAt: d(5), source: "checkout", surface: null },
    ],
    [
      { createdMs: d(4).getTime(), trialEndMs: d(18).getTime(), status: "active", surface: "slidein" },
      { createdMs: d(5).getTime(), trialEndMs: d(19).getTime(), status: "canceled", surface: "slidein" },
      { createdMs: d(25).getTime(), trialEndMs: Date.UTC(2026, 9, 9), status: "trialing", surface: "gate:rising" },
      { createdMs: d(6).getTime(), trialEndMs: null, status: "active", surface: "slidein" }, // no trial — not counted
      { createdMs: Date.UTC(2026, 7, 1), trialEndMs: Date.UTC(2026, 7, 15), status: "active", surface: null }, // before the window
    ],
    since,
    now,
  );
  assert.deepEqual(t.clicks, [["slidein", 2], ["gate:rising", 1]], "checkout rows are excluded from clicks");
  assert.deepEqual(t.checkouts.sort(), [["(no tracked surface)", 1], ["slidein", 1]]);
  assert.deepEqual(Object.fromEntries(t.trials), {
    slidein: { started: 2, matured: 2, converted: 1 },
    "gate:rising": { started: 1, matured: 0, converted: 0 },
  });
});
