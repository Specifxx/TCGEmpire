import { NextResponse } from "next/server";
import { runPriceAlerts } from "@/lib/price-alerts";
import { runDeckWatches } from "@/lib/deck-watch";
import { runSealedWatches } from "@/lib/sealed-watch";
import { bustSealedGroups } from "@/lib/sealed-fresh";
import { PAID_SEND_CAP } from "@/lib/price-alerts";

// The PAID alert run: target-price and below-market alerts for watches owned
// by a Plus/Premium account (lib/price-alerts.ts AlertScope "paid"), then —
// since 2026-09-29 — the DECK PRICE WATCHES (lib/deck-watch.ts, Premium) and
// the SEALED WATCHES (lib/sealed-watch.ts, Plus and Premium). Called by
// .github/workflows/refresh-prices.yml right after each of the two daily
// price imports AND the sealed import (the step order matters: the sealed
// pass reads the groups the sealed import just wrote — and ?fresh=1, sent by
// the workflow whenever it skipped its ISR purge, makes that read uncached:
// lib/sealed-fresh.ts), with the same
// Authorization: Bearer <CRON_SECRET> as the Vercel cron.
//
// THREE INDEPENDENT PASSES. Each has its own try/catch: a failed read aborts
// only that pass, uncached and unwritten, and the other two still run. The
// three share one ALERT_DAILY_BUDGET (lib/alert-budget.ts) and each keeps
// PAID_SEND_CAP for its own new emails. The response carries every pass's
// summary (the card run's at the top level, as before, so the workflow's
// logs read the same).
//
// WHY ITS OWN PATH, NOT ?scope=paid ON THE PARENT ROUTE. A workflow change
// takes effect the moment it lands on main; the route only goes live at the
// next daily 08:00 UTC deploy (CLAUDE.md). The deployed parent route before
// this change ignores any query string, so a step calling
// /api/cron/price-alerts?scope=paid in that window ran a full "all" run —
// free and anonymous watches, FIRST_PRICE_SEND_CAP and the weekly digests —
// after every import, on the shared 100/day Resend quota. This path simply
// 404s until the deploy that adds it, and then can only ever run "paid".
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds: three passes, each pricing lists or reading groups

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const failed = (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : "run failed" });
  const cards = await runPriceAlerts({}, { scope: "paid" }).then((s) => ({ ok: true, ...s })).catch(failed);
  // One PAID_SEND_CAP across the passes: what the card run used is gone (a
  // failed pass reports nothing, so it costs nothing here).
  const afterCards = Math.max(0, PAID_SEND_CAP - ("emails" in cards ? cards.emails : 0));
  const decks = await runDeckWatches({ sendCap: afterCards }).then((s) => ({ ok: true, ...s })).catch(failed);
  const afterDecks = Math.max(0, afterCards - ("newAddresses" in decks ? decks.newAddresses : 0));
  const sealed = await runSealedWatches({ sendCap: afterDecks, freshen: fresh ? bustSealedGroups : undefined }).then((s) => ({ ok: true, ...s })).catch(failed);
  const ok = cards.ok && decks.ok && sealed.ok;
  return NextResponse.json({ ...cards, ok, scope: "paid", decks, sealed }, { status: ok ? 200 : 500 });
}
