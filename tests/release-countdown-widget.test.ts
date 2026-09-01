import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// "Have this countdown elsewhere — my phone, my computer, another website":
// an iframe-embeddable widget (embed/release-countdown) and an add-to-calendar
// .ics download (release-dates/calendar). Both must follow /release-dates' own
// "never hardcode a set name or date" discipline — these tests roll forward the
// same way tests/release-calendar.test.ts does for the page itself.
// ─────────────────────────────────────────────────────────────────────────────

test("the embed widget route is a Route Handler, not a page — it must escape the root layout", () => {
  const src = read("src/app/embed/release-countdown/route.ts");
  assert.match(src, /export async function GET\(/, "must be a route handler");
  assert.doesNotMatch(src, /export default function/, "must not be a page component (would render inside the root layout)");
});

test("the embed widget names no set in code, sourcing everything from release-calendar.ts", () => {
  const src = read("src/app/embed/release-countdown/route.ts");
  assert.match(src, /import \{ nextDatedRelease, assumedStreetInstant, releaseDateLabel \} from "@\/lib\/release-calendar"/);
  // Scoped to CODE, not comments — a comment is allowed to explain, in prose,
  // that a specific set will move through this route someday (release-dates/
  // page.tsx's own header comment does exactly that). The trap
  // /vendetta-countdown and /radiance-countdown both fell into was a set name
  // baked into LOGIC, not into an explanatory comment.
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(codeOnly, /radiance/i, "must not name a specific set");
  assert.doesNotMatch(codeOnly, /vendetta/i, "must not name a specific set");
});

test("the embed widget escapes interpolated values (XSS: a release note/name reaches raw HTML)", () => {
  const src = read("src/app/embed/release-countdown/route.ts");
  assert.match(src, /const esc = \(s: string\)/, "expected an HTML-escaping helper");
  // Every place a real string (name, dateLabel) is interpolated into the shell
  // must go through esc(), not be dropped in raw.
  assert.match(src, /esc\(name\)/);
  assert.match(src, /esc\(dateLabel\)/);
});

test("the widget's own live-tick script recomputes from the target instant, not a server-baked countdown", () => {
  const src = read("src/app/embed/release-countdown/route.ts");
  assert.match(src, /data-target="\$\{esc\(targetIso\)\}"/, "the target instant must be in the DOM for the client script to read");
  assert.match(src, /setInterval\(tick, 1000\)/, "must tick client-side, same cadence as ReleaseCountdownTimer");
});

test("next.config.js's existing /embed/* frame-ancestors allowance actually covers this route's path", () => {
  const config = read("next.config.js");
  assert.match(config, /source: "\/embed\/:path\*"/, "expected the existing /embed/* headers rule");
  assert.match(config, /frame-ancestors \*/, "expected cross-origin framing to be allowed for /embed/*");
  // Confirms /embed/release-countdown is actually under that source pattern.
  assert.match("/embed/release-countdown", /^\/embed\/.+/);
});

test("the calendar route is all-day, not a fabricated timed instant Riot never announced", () => {
  const src = read("src/app/release-dates/calendar/route.ts");
  assert.match(src, /DTSTART;VALUE=DATE:/, "must be an all-day event");
  assert.doesNotMatch(src, /DTSTART:\d{8}T/, "must not emit a timed DTSTART (a fabricated hour)");
});

test("the calendar route names no set in code either", () => {
  const src = read("src/app/release-dates/calendar/route.ts");
  assert.doesNotMatch(src, /radiance/i);
  assert.doesNotMatch(src, /vendetta/i);
});

test("/release-dates links to both new surfaces, gated on there being an active countdown, right after the email signup", () => {
  const src = read("src/app/release-dates/page.tsx");
  assert.match(src, /href="\/release-dates\/calendar"/);
  assert.match(src, /\/embed\/release-countdown/);
  assert.match(src, /\{next && nextInstant && \(\s*<div className="mt-8">\s*<h2[^>]*>Take this countdown with you/, "the whole section must be gated the same way the countdown itself is");
  // Ordering: right after <NewsletterSignup ... />, before "Every Riftbound
  // release, in order" — reported directly, so pin the position, not just
  // the section's existence.
  const newsletterAt = src.indexOf("<NewsletterSignup");
  const takeItAt = src.indexOf("Take this countdown with you");
  const calendarTableAt = src.indexOf("Every Riftbound release, in order");
  assert.ok(newsletterAt > -1 && takeItAt > -1 && calendarTableAt > -1, "expected all three sections to exist");
  assert.ok(newsletterAt < takeItAt, "the embed/calendar section must come after the newsletter signup");
  assert.ok(takeItAt < calendarTableAt, "the embed/calendar section must come before the full release table");
});

test("the full release table has its own capped, scrollable height with a sticky header", () => {
  const src = read("src/app/release-dates/page.tsx");
  const tableSectionAt = src.indexOf("Every Riftbound release, in order");
  const section = src.slice(tableSectionAt, tableSectionAt + 1200);
  assert.match(section, /max-h-\d+[\s\S]{0,20}overflow-y-auto/, "the table's own container must cap height and scroll vertically");
  assert.match(section, /overflow-x-auto/, "must keep the existing horizontal scroll for narrow viewports");
  assert.match(section, /<thead className="sticky top-0[^"]*bg-ink-900/, "the header row must stay visible while scrolling, with a background matching card-surface");
});

// ── Functional: actually run the handlers, not just read their source ────────

test("GET /embed/release-countdown returns a real, cacheable HTML document", async () => {
  const { GET } = await import("../src/app/embed/release-countdown/route");
  const res = await GET();
  assert.equal(res.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex");
  const body = await res.text();
  assert.match(body, /<!doctype html>/i);
  // Either a live countdown or the graceful "nothing scheduled" fallback — both
  // valid depending on where `now` falls in the real calendar, never a crash.
  assert.ok(/rc-grid|Nothing dated yet/.test(body));
});

test("GET /release-dates/calendar returns a parseable VCALENDAR when a release is dated", async () => {
  const { GET } = await import("../src/app/release-dates/calendar/route");
  const { nextDatedRelease } = await import("../src/lib/release-calendar");
  const res = await GET();
  const next = nextDatedRelease();
  if (!next) {
    assert.equal(res.status, 404, "no dated release → the route must say so, not emit an empty/broken calendar");
    return;
  }
  assert.equal(res.headers.get("Content-Type"), "text/calendar; charset=utf-8; method=PUBLISH");
  assert.match(res.headers.get("Content-Disposition") ?? "", /attachment; filename="riftbound-\d{4}-\d{2}-\d{2}\.ics"/);
  const body = await res.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /END:VCALENDAR/);
  assert.match(body, /BEGIN:VEVENT/);
  assert.match(body, new RegExp(`SUMMARY:Riftbound: ${next.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} releases`));
  // CRLF line endings — RFC 5545 requires it, and a bare \n breaks stricter
  // calendar clients (notably some Outlook versions).
  assert.ok(body.includes("\r\n"), "must use CRLF line endings");
});
