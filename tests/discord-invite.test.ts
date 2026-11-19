import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discordInvite } from "../src/lib/sister-alerts/discord";
import { discordLine } from "../src/lib/sister-alerts/email";

// The Discord hub (owner, 2026-11-20): card sites' alert emails invite to it, every other side never does.
test("card sites get their own invite; other sides get none", () => {
  for (const k of ["dex", "mtg", "lorcana", "ygo", "tcgprices", "gundam", "cyberpunk", "bandai"]) {
    assert.match(discordInvite(k) ?? "", /^https:\/\/discord\.gg\/[A-Za-z0-9]+$/, k);
  }
  for (const k of ["scent", "kaeyoung", "figure", "wax", "wargame", "motor", "cam"]) {
    assert.equal(discordInvite(k), null, k);
    assert.equal(discordLine(k), "", k);
  }
  assert.match(discordLine("dex"), /free on our Discord/);
});

test("RiftCompare points at the hub with its own invite, and shows a reason to join", () => {
  const site = readFileSync("src/lib/site.ts", "utf8");
  assert.match(site, /DISCORD_URL = "https:\/\/discord\.gg\/5pdA3QVPBS"/);
  assert.doesNotMatch(site, /NypdmfAMTa/, "the old RiftCompare server is not the owner's and has no feeds");
  const cta = readFileSync("src/components/DiscordCta.tsx", "utf8");
  assert.match(cta, /Restock and price-drop alerts/);
  assert.match(cta, /rel="noopener noreferrer"/);
  assert.match(readFileSync("src/app/layout.tsx", "utf8"), /<DiscordCta /);
  assert.match(readFileSync("src/app/sealed/[slug]/page.tsx", "utf8"), /<DiscordCta /);
});
