import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SourceResult } from "../src/lib/earnings/core";
import { EARNINGS_MARKER, EARNINGS_MARKER_TEXT, EARNINGS_UNAVAILABLE, earningsDigest, fillEarnings } from "../src/lib/earnings/digest";
import { buildDigestEmail } from "../src/lib/ops/mail";
import { emptyInbox } from "../src/lib/ops/types";

const today = "2026-10-26";
const src = (key: SourceResult["key"], status: SourceResult["status"], days: SourceResult["days"], tags?: SourceResult["tags"]): SourceResult => ({
  key,
  status,
  days,
  tags,
  fetchedAt: 0,
});

test("the money section totals each source for 7 and 30 days and splits eBay by site", () => {
  const sources = [
    src("stripe", "ok", [{ day: "2026-10-25", currency: "AUD", cents: 1000 }, { day: "2026-10-01", currency: "AUD", cents: 500 }]),
    src("ebay", "ok", [{ day: "2026-10-24", currency: "AUD", cents: 2000 }], [
      { day: "2026-10-24", tag: "rc-au-card", currency: "AUD", cents: 1500, pendingCents: 0, sales: 2 },
      { day: "2026-10-24", tag: "op-us-card", currency: "AUD", cents: 500, pendingCents: 0, sales: 1 },
    ]),
    src("adsense", "not-configured", []),
  ];
  const d = earningsDigest(sources, [], today, "https://riftcompare.com/admin/earnings");
  assert.match(d.text, /Last 30 days: A\$35\.00 earned \(7 days: A\$30\.00\)/);
  assert.match(d.text, /eBay Partner Network: A\$20\.00 \(7d\), A\$20\.00 \(30d\)/);
  assert.match(d.text, /RiftCompare \(Riftbound\): A\$15\.00 from 2 sales/);
  assert.match(d.text, /One Piece: A\$5\.00 from 1 sale\b/);
  assert.match(d.text, /Not connected: Google AdSense/);
  assert.ok(!d.html.includes("<script"));
});

test("the monitor's digest carries only the markers, never an amount", () => {
  const mail = buildDigestEmail({ version: 1, generatedAt: "2026-10-26T00:00:00Z", results: [], inbox: emptyInbox() });
  assert.ok(mail.html.includes(EARNINGS_MARKER));
  assert.ok(mail.text.includes(EARNINGS_MARKER_TEXT));
  const filled = fillEarnings(mail, EARNINGS_UNAVAILABLE);
  assert.ok(!filled.html.includes(EARNINGS_MARKER));
  assert.ok(!filled.text!.includes(EARNINGS_MARKER_TEXT));
});

test("the route fills the money section itself and never returns it", () => {
  const route = readFileSync(new URL("../src/app/api/cron/ops-notify/route.ts", import.meta.url), "utf8");
  assert.match(route, /fillEarnings\(/);
  assert.doesNotMatch(route, /NextResponse\.json\([^)]*\b(mail|block)\b/);
  // The monitor sends a money digest through the site, not straight to Resend.
  const monitor = readFileSync(new URL("../scripts/ops-monitor.ts", import.meta.url), "utf8");
  assert.match(monitor, /!mail\.html\.includes\(EARNINGS_MARKER\)/);
});
