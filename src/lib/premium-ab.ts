// PREMIUM PAGE A/B TESTS (Premium team, 2026-11-23; /mnt/project-files/ops/premium/
// playbook.md and tests.md). Client-safe: no server imports.
//
// One test at a time on /premium, Monday 00:00 UTC to the next Monday, its dates
// in code so it starts and stops without a deploy. Outside the window nobody is
// put in an arm and every arm-only block stays hidden.
//
// The coin is set by PAB_BOOT, an inline script that runs before the page paints,
// so the B block appears without a layout shift: the server renders it with
// `hidden pab1-b`, and globals.css shows it under html[data-pab1="b"]. The arm
// is kept in localStorage so a signed-out visitor who signs in and reaches
// /premium/start still carries it into premium_checkout_started (`pk`).
//
// pab1 (P1): A is today's page; B adds one line under the headline with the
// biggest real gap the Deal Finder shows today (a US store price under
// TCGplayer market). Metric: premium_checkout_started with pk per pab_seen
// visitor. Call on 7 Dec at p < 0.10 with 150+ visitors an arm.

export const PAB1 = {
  key: "pab1",
  start: Date.UTC(2026, 10, 30), // Mon 30 Nov 2026 00:00 UTC
  end: Date.UTC(2026, 11, 7), // Mon 7 Dec 2026 00:00 UTC
} as const;

export type PabArm = "a" | "b";

export function pabActive(now: number = Date.now()): boolean {
  return now >= PAB1.start && now < PAB1.end;
}

/** The visitor's arm, or null outside the window or before the boot script ran. Never assigns one. */
export function pabArm(now: number = Date.now()): PabArm | null {
  if (!pabActive(now) || typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PAB1.key);
    return v === "a" || v === "b" ? v : null;
  } catch {
    return null;
  }
}

/** The `pk` property for analytics events: "pab1-a", "pab1-b", or undefined (dropped by trackEvent). */
export function pabKey(now: number = Date.now()): string | undefined {
  const arm = pabArm(now);
  return arm ? `${PAB1.key}-${arm}` : undefined;
}

/** Inline, before paint: inside the window, flip (or reuse) the coin and mark <html data-pab1>. */
export const PAB_BOOT = `(function(){try{var n=Date.now();if(n<${PAB1.start}||n>=${PAB1.end})return;var k="${PAB1.key}",v=localStorage.getItem(k);if(v!=="a"&&v!=="b"){v=Math.random()<0.5?"a":"b";localStorage.setItem(k,v)}document.documentElement.setAttribute("data-${PAB1.key}",v)}catch(e){}})()`;
