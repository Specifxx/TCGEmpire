import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "src/lib/revalidate-content.ts"), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// A PURGE PATH THAT MATCHES NO ROUTE FAILS SILENTLY.
//
// revalidatePath() does not validate its argument and does not throw on a path
// that resolves to nothing — it just purges nothing. So a renamed route, or a
// dynamic segment written with the wrong bracket name, leaves that surface
// serving stale HTML until its TTL fallback expires, with no error anywhere.
//
// That failure mode is expensive here in BOTH directions. The strategy this
// codebase runs on (see lib/revalidate-content.ts's header) is: long TTL, purge
// on demand after each price import. A path in this list that silently purges
// nothing means a page can be a full day stale after an import — and the usual
// reaction to that symptom is to shorten the page's TTL, which is precisely how
// the article routes ended up regenerating 144x a day.
// ─────────────────────────────────────────────────────────────────────────────

function routeExistsFor(path: string): boolean {
  // "/" → src/app/page.tsx; "/card/[id]" → src/app/card/[id]/page.tsx;
  // "/feed.xml" → src/app/feed.xml/route.ts. Dynamic segments are kept verbatim
  // because that is exactly what has to match the directory name on disk.
  const rel = path === "/" ? "" : path.replace(/^\//, "");
  const dir = join(ROOT, "src/app", rel);
  return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"));
}

test("every path revalidateContent() purges resolves to a real route", () => {
  // The `["/x", "page"]` tuples plus the bare revalidatePath("/x") calls.
  const tuples = [...src.matchAll(/\["(\/[^"]*)",\s*"(?:page|layout)"\]/g)].map((m) => m[1]);
  const bare = [...src.matchAll(/revalidatePath\("(\/[^"]*)"\)/g)].map((m) => m[1]);
  const listed = [...src.matchAll(/for \(const \w+ of \[([^\]]+)\]\) revalidatePath/g)]
    .flatMap((m) => [...m[1].matchAll(/"(\/[^"]*)"/g)].map((x) => x[1]));

  const paths = [...new Set([...tuples, ...bare, ...listed])];
  // Guard the parse itself: if these regexes stop matching (the file is
  // restructured), an empty list would make this test vacuously pass.
  assert.ok(paths.length >= 15, `expected to parse the purge list, found ${paths.length} paths`);

  const missing = paths.filter((p) => !routeExistsFor(p));
  assert.deepEqual(missing, [], `these purge nothing — no route file on disk:\n${missing.join("\n")}`);
});

test("the price-derived pages that are prerendered at build are all purged", () => {
  // Not every route belongs here — only the ones that BOTH render live prices
  // and are prerendered with a long TTL, because those are the ones whose only
  // other freshness mechanism is waiting out the fallback.
  const mustPurge = [
    "/",
    "/movers",
    "/card/[id]",
    "/sets/[set]",
    "/domains/[slug]",
    "/blog/[slug]",
    "/guides/[slug]",
  ];
  for (const p of mustPurge) {
    assert.match(
      src,
      new RegExp(`\\["${p.replace(/[[\]]/g, "\\$&")}",`),
      `${p} embeds live prices and is prerendered — without a purge here its only ` +
        `freshness mechanism is its TTL, and shortening that TTL is how /blog and ` +
        `/guides came to regenerate 144x a day.`
    );
  }
});
