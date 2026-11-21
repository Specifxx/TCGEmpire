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
  assert.match(discordLine("dex"), /Get these first on <a href="https:\/\/discord\.gg\/n6nc7EQH2D"[^>]*>Discord<\/a> or <a href="https:\/\/t\.me\/tcgdealsrestocks"/);
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

test("the hub member count is status only: ok with a number, unknown otherwise, never an alert", async () => {
  const { discordMembers } = await import("../src/lib/ops/checks");
  const mk = (res: () => Response) =>
    ({ now: new Date("2026-11-20T00:00:00Z"), sleep: async () => {}, fetch: async () => res() }) as unknown as Parameters<typeof discordMembers>[0];
  const ok = await discordMembers(mk(() => new Response(JSON.stringify({ approximate_member_count: 12, approximate_presence_count: 3 }), { status: 200 })));
  assert.equal(ok.severity, "ok");
  assert.match(ok.summary, /12 members/);
  assert.equal((await discordMembers(mk(() => new Response("x", { status: 403 })))).severity, "unknown");
  assert.equal((await discordMembers(mk(() => { throw new Error("down"); }))).severity, "unknown");
});
