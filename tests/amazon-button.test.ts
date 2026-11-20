// The Amazon row's button is amber (owner, 2026-11-18) and the quick views carry a real "See full page" button.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

test(".btn-amazon is amber with dark ink in both themes", () => {
  assert.match(read("src/app/globals.css"), /\.btn-amazon \{\s*@apply btn border border-\[#B7791F\] bg-\[#F5A524\] text-\[#111111\] hover:bg-\[#DC8A0B\]/);
});

test("the priced and the unpriced Amazon rows use .btn-amazon", () => {
  const live = read("src/components/AmazonLiveSlot.tsx");
  const check = read("src/components/AmazonCheckRow.tsx");
  assert.match(live, /className="btn-amazon /);
  assert.doesNotMatch(live, /btn-buy/);
  assert.match(check, /className="btn-amazon /);
  assert.match(check, /Check on Amazon/);
  assert.match(live, /retailer="amazon_sealed"/);
});

// It is a full-width SECONDARY button since 2026-11-20 (boardroom): as the first btn-primary on a phone it drew taps off the
// price rows, and Rift's quick-view buy clicks fell from ~41 to ~10 visitors a day on 18 Nov, the day it went primary.
test("every quick view has a full-width secondary See full page button, never the primary colour", () => {
  for (const f of ["src/components/QuickView.tsx", "src/components/SealedQuickView.tsx", "src/components/pokemon/PokemonQuickView.tsx"]) {
    const src = read(f);
    assert.match(src, /data-quickview-fullpage className="btn-ghost[^"]*min-h-11[^"]*w-full/, f);
    assert.match(src, /See full page: price history and details/, f);
  }
});
