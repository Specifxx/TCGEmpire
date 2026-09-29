import { NextResponse } from "next/server";
import { runSealedWatches } from "@/lib/sealed-watch";
import { freshSealedLoaders } from "@/lib/sealed-alert-read";
import { PAID_SEND_CAP } from "@/lib/price-alerts";

// THE SEALED-ONLY ALERT RUN (2026-09-29): the sealed watches (lib/sealed-watch.ts,
// Plus and Premium) and nothing else. Called by .github/workflows/sealed-refresh.yml
// right after the stores-only sealed import at 01:00 and 13:00 UTC, which with
// refresh-prices.yml's 07:00 and 19:00 makes a sealed check about every six hours.
// Same Authorization: Bearer <CRON_SECRET> as every cron route.
//
// ONLY runSealedWatches. Not the card run, not the deck watches, not the set
// digests: those run twice a day after the price imports and must not run four
// times (the shared ALERT_DAILY_BUDGET is spent per ADDRESS per day, and a
// second card pass would only re-read prices no import has changed). The pass
// takes the whole PAID_SEND_CAP for its own new addresses and the same
// ALERT_DAILY_BUDGET as the paid route, so this route can never email more
// addresses in a day than the paid route could; lapsed owners are skipped
// untouched inside the run, as there.
//
// NO CACHE BUST. The paid route's ?fresh=1 calls bustSealedGroups
// (lib/sealed-fresh.ts), which revalidates CONTENT_TAG. Here that would clear
// every CONTENT_TAG cache on the site two extra times a day for a page that
// refreshes on 07:00 and 19:00, so the pass reads the listings itself,
// uncached (lib/sealed-alert-read.ts), and the public /sealed page is left
// exactly as it was.
//
// Its own path, and it 404s until the deploy that adds it (CLAUDE.md: the
// daily release), which the workflow's curl tolerates.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds: one read per watched market, one send loop

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loaders = freshSealedLoaders();
  const sealed = await runSealedWatches({ sendCap: PAID_SEND_CAP, groups: loaders.groups, preorderGroups: loaders.preorderGroups })
    .then((s) => ({ ok: true as const, ...s }))
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "run failed" }));
  return NextResponse.json({ ok: sealed.ok, scope: "sealed", sealed }, { status: sealed.ok ? 200 : 500 });
}
