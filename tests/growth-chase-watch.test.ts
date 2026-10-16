import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RADIANCE_CHASE_SLUGS } from "../src/lib/radiance-watch";
import { FREE_WATCHLIST_LIMIT } from "../src/lib/free-limits";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

// ─────────────────────────────────────────────────────────────────────────────
// "Follow Radiance's chase cards" (2026-10-16 growth pass; DECISIONS.md,
// "Growth: meet readers where they are"). Spoiler readers are four in five
// search visits; one click makes an account that is already watching.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the chase list fits a free watchlist with room to spare, and every card exists", () => {
  assert.ok(RADIANCE_CHASE_SLUGS.length >= 4 && RADIANCE_CHASE_SLUGS.length <= FREE_WATCHLIST_LIMIT - 2, "a new free account takes them all and keeps two slots");
  const cards = JSON.parse(read("data/public/cards.json")) as { slug: string; setCode: string; imageThumbUrl: string | null; imageUrl: string | null }[];
  const bySlug = new Map(cards.map((c) => [c.slug, c]));
  for (const s of RADIANCE_CHASE_SLUGS) {
    const c = bySlug.get(s);
    assert.ok(c, `${s} is in the catalogue`);
    assert.equal(c!.setCode, "RAD");
    assert.ok(c!.imageThumbUrl || c!.imageUrl, `${s} has a card image for the strip`);
  }
});

test("it is attributed, and it replaces the email box on Radiance posts rather than adding a second ask", () => {
  assert.ok(SIGNUP_SOURCES.has("radiance_watch"));
  const cta = read("src/components/ChaseWatchCta.tsx");
  assert.match(cta, /markSignupSource\(CHASE_WATCH_SOURCE\)/);
  assert.match(cta, /localStorage\.setItem\(PENDING_WATCH_KEY, JSON\.stringify\(\{ cardIds: ids, market: country/);
  const view = read("src/components/ArticleView.tsx");
  assert.match(view, /chaseCards\.length \? \(\s*<ChaseWatchCta[\s\S]*?\) : \(\s*<ArticleSignupCta placement="article_intro"/);
  for (const f of ["src/app/sets/[set]/page.tsx", "src/app/sets/[set]/gallery/page.tsx"]) {
    assert.match(read(f), /set\.slug === "radiance" && chaseCards\.length > 0 && <ChaseWatchCta/, f);
  }
});

test("after sign-in, the stashed cards are watched: a list or one card, capped and type-checked", () => {
  const w = read("src/components/SignupWelcome.tsx");
  assert.match(w, /Array\.isArray\(pending\.cardIds\) \? pending\.cardIds : pending\.cardId \? \[pending\.cardId\] : \[\]/);
  assert.match(w, /\.slice\(0, 12\)/, "a client-written stash cannot fan out without bound");
  assert.match(w, /if \(limitHit !== null\) break;/, "it stops at the free limit instead of hammering the route");
});
