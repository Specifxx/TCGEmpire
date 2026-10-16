import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// The signed-out sign-up card, restored 2026-10-15 (owner: "bring the sign up
// now pop up again … gate it and make it appear after so many pages, because
// some people just are annoyed at it"). DECISIONS.md, "Premium gets loud".

test("the sign-up card is signed-out only, gated by page count, and mounted once in the layout", () => {
  const src = read("src/components/SignupSlideIn.tsx");
  assert.match(src, /const signedOut = loaded && answered === true && !user;/, "only after /api/me really answered, never for a member");
  assert.match(src, /signupCardEligible\(\{ views, pathname \}\)/, "the 2nd-page gate (lib/nudge-gate.ts)");
  assert.match(src, /armNudge\(\{\s*delayMs: NUDGE_DELAY_MS,/, "the shared 12 s settle-in and quiet-moment rules");
  assert.match(src, /readNum\(ls, DISMISS_COUNT\) >= MAX_NUDGE_DISMISSALS/, "two dismissals and it stops for good");
  assert.match(src, /ss\?\.getItem\(SESSION_SEEN\) === "1"/, "once a session");
  assert.match(src, /src=signup_card/, "attributed");
  assert.doesNotMatch(src, /role="dialog"|aria-modal/, "a corner card, never a modal");
  assert.equal((read("src/app/layout.tsx").match(/<SignupSlideIn \/>/g) ?? []).length, 1);
  assert.match(read("src/lib/signup-source-shared.ts"), /"signup_card",/);
});
