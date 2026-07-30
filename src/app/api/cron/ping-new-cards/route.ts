import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidateContent } from "@/lib/revalidate-content";
import { pingAfterCardImport } from "@/lib/indexnow";
import { setByCode } from "@/lib/constants";

// LAUNCH-WEEK INDEXING: purge the sitemap and ping IndexNow for cards that were
// just imported.
//
// WHY THIS EXISTS. New cards do not arrive via the price importer — they arrive via
// maintenance.yml's cards-sync / vendetta-pipeline / fetch-promos / tcg-printings
// tasks. Those tasks wrote to the DB and then did nothing else: no revalidation, no
// ping. So a freshly imported card sat OUT of /sitemaps/cards.xml until the next
// price refresh happened to purge it — up to ~9h, or the full 24h ISR TTL if that
// refresh's revalidate call failed (it is deliberately non-fatal). Worse,
// indexnow-submit.yml reads the LIVE sitemap at 06:10 UTC, so it would happily
// resubmit a list that still omitted the new cards. During a set launch, that lag
// is the entire opportunity.
//
// Called from maintenance.yml after any card-mutating task (and safe to hit by hand
// mid-launch: it is idempotent and derives its own URL list).
//
// Google vs the rest: IndexNow reaches Bing/Yandex/Seznam/Naver, NOT Google (see
// lib/indexnow.ts). Google's half of the fix is revalidateContent() below, which
// purges the sitemap children so the new cards are actually discoverable on
// Google's next sitemap fetch instead of up to a day later.
export const dynamic = "force-dynamic";

// Default lookback. Generous on purpose: an import can run long, and re-pinging a
// URL that was already submitted is harmless (IndexNow dedupes, and pingIndexNow
// collapses duplicates), whereas MISSING a new card is the failure that costs
// launch-week traffic.
const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 14;

function authorized(req: Request): boolean {
  // Same CRON_SECRET as /api/revalidate and the other /api/cron/* routes — no new
  // secret to provision. Fails CLOSED when unset: an open endpoint would let anyone
  // force mass regenerations and burn the IndexNow quota.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("token") === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = Number(new URL(req.url).searchParams.get("hours"));
  const hours = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_HOURS) : DEFAULT_HOURS;
  const since = new Date(Date.now() - hours * 3600_000);

  // Cards created in the window. `createdAt` is the real import timestamp, so this
  // needs no coordination with (and cannot drift from) whatever the importer did.
  let cards: { slug: string | null; id: string; setCode: string }[] = [];
  try {
    cards = await prisma.card.findMany({
      where: { createdAt: { gte: since } },
      select: { slug: true, id: true, setCode: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
  } catch (e) {
    console.error("ping-new-cards: card query failed:", e);
    return NextResponse.json({ error: "Card query failed" }, { status: 503 });
  }

  // ALWAYS revalidate, even when zero new cards: the caller just ran an import that
  // may have UPDATED existing cards (new printings' art, prices, promo flags), and
  // the sitemap's lastmod values should reflect that regardless.
  const revalidated = revalidateContent().length;

  const slugs = cards.map((c) => c.slug ?? c.id);
  // Affected set hubs too — a new card changes its set page's card list. Mapped
  // through setByCode so an unrecognised/coming-soon set code can't produce a URL
  // that 404s.
  const setSlugs = [
    ...new Set(
      cards
        .map((c) => setByCode(c.setCode))
        .filter((s): s is NonNullable<typeof s> => !!s && !s.comingSoon)
        .map((s) => s.slug)
    ),
  ];

  const submitted = await pingAfterCardImport(slugs, setSlugs);

  return NextResponse.json({
    ok: true,
    hours,
    newCards: cards.length,
    setsTouched: setSlugs,
    revalidated,
    // 0 here with newCards > 0 means the IndexNow ping was skipped (non-production)
    // or failed — see lib/indexnow.ts. Not an error: the sitemap purge above is the
    // part Google needs, and it already happened.
    indexnowSubmitted: submitted,
    at: new Date().toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
