// RiftCompare's family feed (lib/family.ts, DECISIONS.md "Sites that grow each other", 2026-11-02): run by
// refresh-prices.yml right after export-public-data.ts, before the snapshot is published, so the feed rides
// the same commit to main (data/public/family/family-feed.json). Reads the snapshot files only, never Neon.
// Never fails the step: on any error it writes nothing and the sisters keep yesterday's feed until it ages out.
import fs from "node:fs";
import path from "node:path";
import { familyItemsFromRows, familyLinks, type SealedRow } from "../src/lib/family";
import { FEED_FILE, buildFeed } from "../src/lib/family-network";

try {
  const dir = path.join(process.cwd(), "data", "public");
  const rows = JSON.parse(fs.readFileSync(path.join(dir, "sealed-listings.json"), "utf8")) as SealedRow[];
  const feed = buildFeed("rift", familyItemsFromRows(rows, new Date().toISOString().slice(0, 10)), familyLinks());
  fs.mkdirSync(path.join(dir, "family"), { recursive: true });
  fs.writeFileSync(path.join(dir, "family", FEED_FILE), JSON.stringify(feed, null, 1) + "\n");
  console.log(`[family] ${FEED_FILE}: ${feed.items.length} items`);
} catch (e) {
  console.warn("[family] skipped:", e instanceof Error ? e.message : e);
}
