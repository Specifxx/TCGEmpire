import test from "node:test";
import assert from "node:assert/strict";
import { AWIN_FALLBACK, awinTerms, bestPerNetwork, classifyClickValue, foldNetworks, networkCountsOf } from "../src/lib/analytics/click-networks";

const awin = AWIN_FALLBACK;

test("classifyClickValue reads each site family's way of naming the destination", () => {
  for (const [value, want] of [
    ["TCGplayer", "tcgplayer"],
    ["partner.tcgplayer.com", "tcgplayer"],
    ["eBay (ebay.com.au)", "ebay"],
    ["dock_ebay", "ebay"],
    ["ebay.co.uk", "ebay"],
    ["Amazon US", "amazon"],
    ["amazon.com.au", "amazon"],
    ["amazon_quickview", "amazon"],
    ["stylevana", "awin"],
    ["Clifton Cameras", "awin"],
    ["www.cliftoncameras.co.uk", "awin"],
    ["Hamleys", "awin"],
    ["https://www.awin1.com/cread.php?awinmid=1205", "awin"],
    ["Pokebox (AU)", null],
    ["card_top", null],
    ["yesstyle", null],
  ] as const) assert.equal(classifyClickValue(value, awin), want, value);
});

test("awinTerms takes names and registrable domain labels from programmes.json", () => {
  const terms = awinTerms({ joined: [{ name: "Clifton Cameras", domains: ["cliftoncameras.co.uk", "dev.cliftoncameras.co.uk"] }, { name: "Paco Perfumerias", domains: ["perfumeprice.co.uk"] }, { name: "Box", domains: ["box.co.uk"] }] });
  assert.deepEqual(terms.sort(), ["cliftoncameras", "pacoperfumerias", "perfumeprice"]);
  assert.deepEqual(awinTerms(null), []);
});

test("per network the largest key wins, never the sum; projects fold into sites", () => {
  const retailer = networkCountsOf({ data: [{ eventData: "eBay", count: 9 }, { eventData: "TCGplayer", count: 4 }, { eventData: "Some Shop", count: 30 }] }, awin);
  const placement = networkCountsOf({ data: [{ eventData: "amazon-row", count: 2 }, { eventData: "ebay_strip", count: 5 }] }, awin);
  assert.deepEqual(retailer, { tcgplayer: 4, ebay: 9, amazon: 0, awin: 0 });
  const best = bestPerNetwork([retailer, placement]);
  assert.deepEqual(best, { tcgplayer: 4, ebay: 9, amazon: 2, awin: 0 });
  const sites = foldNetworks([{ project: "dex-a", counts: best }, { project: "dex-b", counts: { tcgplayer: 1, ebay: 0, amazon: 0, awin: 0 } }], (p) => p.split("-")[0]);
  assert.deepEqual(sites.get("dex"), { tcgplayer: 5, ebay: 9, amazon: 2, awin: 0 });
  assert.deepEqual(networkCountsOf(null, awin), { tcgplayer: 0, ebay: 0, amazon: 0, awin: 0 });
});
