import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COUNTRIES, DEFAULT_COUNTRY, normalizeCountry } from "../src/lib/country";

// Outreach-ready assets (2026-09-25): the things the first outreach emails point
// at have to exist and say true things before anyone is sent there.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the private store report offers the store's badge, gated on the thin-page threshold", () => {
  const src = read("src/app/stores/report/page.tsx");
  assert.match(src, /import \{ storeBadgeHtml \} from "@\/lib\/store-badge"/);
  assert.match(src, /storeBySlug\(storeSlug\(partner\.retailer\)\)/);
  assert.match(src, /mine\.length >= STORE_THIN_THRESHOLD/);
  assert.match(src, /storeBadgeHtml\(badgeStore\)/);
  assert.match(src, /robots: \{ index: false, follow: false \}/, "the report stays noindex");
  // Zero new reads: still exactly the partner lookup, the listings and the rivals.
  assert.equal((src.match(/await prisma\./g) ?? []).length, 3);
});

test("/embed states the card widget's real default market", () => {
  const src = read("src/app/embed/page.tsx");
  assert.doesNotMatch(src, /Defaults to Australia/);
  assert.equal(normalizeCountry(null), "US");
  assert.match(src, new RegExp(`Defaults to ${COUNTRIES[normalizeCountry(null)].place}\\.`, "i"));
});

test("the Discord install section on /embed is gated on NEXT_PUBLIC_DISCORD_APP_ID", () => {
  const src = read("src/app/embed/page.tsx");
  assert.match(src, /process\.env\.NEXT_PUBLIC_DISCORD_APP_ID/);
  assert.match(src, /\{DISCORD_INSTALL_URL && \(/, "section renders only with an app id");
  assert.match(src, /https:\/\/discord\.com\/oauth2\/authorize\?client_id=\$\{encodeURIComponent\(DISCORD_APP_ID\)\}&scope=applications\.commands/);
  assert.match(src, /export const revalidate = 86400;/, "the page stays static");
  assert.doesNotMatch(src, /<iframe src="https:\/\/discord/);
  assert.match(read(".env.example"), /^# NEXT_PUBLIC_DISCORD_APP_ID=/m);
});

test("the Discord bot names the market it computes and uses the card-art mirror", () => {
  const src = read("src/app/api/discord/interactions/route.ts");
  assert.doesNotMatch(src, /AU market/);
  assert.match(src, /getPriceMovers\(DEFAULT_COUNTRY, 3\)/);
  assert.match(src, /footer: \{ text: `\$\{COUNTRIES\[DEFAULT_COUNTRY\]\.label\} market · updated daily · riftcompare\.com` \}/);
  assert.equal(`${COUNTRIES[DEFAULT_COUNTRY].label} market`, "United States market");
  assert.match(src, /cardImageSrc\(card, \{ absolute: true \}\)/);
  assert.doesNotMatch(src, /thumbnail: \{ url: card\.imageThumbUrl \}/);
});

test("the outreach kit's deck-link recipe matches how the deck page decodes ?list=", () => {
  const kit = read("docs/OUTREACH-KIT.md");
  assert.match(kit, /'https:\/\/riftcompare\.com\/deck\?list=' \+ encodeURIComponent\(btoa\(unescape\(encodeURIComponent\(decklist\)\)\)\)/);
  assert.match(read("src/app/deck/page.tsx"), /decodeURIComponent\(escape\(atob\(b64\)\)\)/);
  // Round trip, including non-ASCII card names.
  const decklist = "3 Irelia, Fervent\n1 Kai'Sa — Survivor";
  const url = "https://riftcompare.com/deck?list=" + encodeURIComponent(btoa(unescape(encodeURIComponent(decklist))));
  const param = new URL(url).searchParams.get("list") ?? "";
  assert.equal(decodeURIComponent(escape(atob(param))), decklist);
  assert.doesNotMatch(kit, /linking the\s+> words "compare prices"/, "Template 1 no longer asks the store to edit its own copy");
});
