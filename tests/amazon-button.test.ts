// The Amazon row's button is amber (owner, 2026-11-18) and the quick views carry a real "See full page" button.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

test(".btn-amazon is amber with dark ink in both themes", () => {
  assert.match(read("src/app/globals.css"), /\.btn-amazon \{\s*@apply btn border border-\[#e08a00\] bg-\[#ffa41c\] text-\[#111111\] hover:bg-\[#fa8900\]/);
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

test("every quick view has a prominent See full page button", () => {
  for (const f of ["src/components/QuickView.tsx", "src/components/SealedQuickView.tsx", "src/components/pokemon/PokemonQuickView.tsx"]) {
    const src = read(f);
    assert.match(src, /data-quickview-fullpage className="btn-primary[^"]*min-h-11[^"]*w-full/, f);
    assert.match(src, /See full page: price history and details/, f);
  }
});
