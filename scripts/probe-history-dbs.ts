/**
 * READ-ONLY survey of PriceHistory across EVERY database in the history
 * rotation. Writes nothing, anywhere.
 *
 * Why this exists separately from probe-databases.ts: that script surveys the
 * OPERATIONAL rotation and reports User/MarketplaceListing/Order/Card counts.
 * It reports nothing about PriceHistory, so when price history goes stale it
 * cannot tell you which history project actually holds the rows — which is the
 * one question that matters. audit-history.ts is the other half of the gap: it
 * reports PriceHistory in detail but ONLY for the single database db-history.ts
 * currently resolves, so it cannot compare RH7 against HISTORY_DATABASE_URL.
 *
 * Everything here is a SQL aggregate (COUNT/MIN/MAX/GROUP BY) rather than a
 * findMany, because the whole reason this rotation exists is that these
 * projects keep exhausting their Neon transfer allowance. The one exception is
 * the distinct-cardId list, which is bounded by the card catalogue (~1.4k cuids,
 * tens of KB) and is needed for the orphan check below.
 *
 * THE ORPHAN CHECK is the important part. PriceHistory.cardId points at Card.id
 * in the OPERATIONAL database, but the two live in different Neon projects with
 * no foreign key between them. If the operational database is ever rebuilt from
 * a source whose Card rows carry different ids, every history row silently
 * becomes an orphan: the tables are full, every count looks healthy, and yet
 * /api/v1/cards.json returns [] and every card page's history chart is empty,
 * because the join finds nothing. Counts alone cannot detect that. This can.
 *
 * Usage: npx tsx scripts/probe-history-dbs.ts
 */
import { PrismaClient } from "@prisma/client";

// Mirrors db-history.ts's HISTORY_URL chain, in order, plus the spare the
// operator may want to migrate INTO. Kept as a list of names so the report can
// say which variable it is talking about without ever printing a credential.
const HISTORY_VARS = [
  "HISTORY_DATABASE_URL_2",
  "HISTORY_DATABASE_URL",
  "RH7",
  "RH6",
  "RH5",
  "HISTORY_DATABASE_URL_4",
  "HISTORY_DATABASE_URL_3",
] as const;

// The operational chain, in db.ts order — we need the LIVE Card ids to test
// history rows against.
const OPERATIONAL_VARS = ["DATABASE_URL_3", "DATABASE_URL_2", "DATABASE_URL", "RM5", "RM4", "RM3"] as const;

function clientFor(url: string) {
  return new PrismaClient({ datasources: { db: { url } }, log: ["error"] });
}

async function withClient<T>(url: string, fn: (c: PrismaClient) => Promise<T>): Promise<T | null> {
  const c = clientFor(url);
  try {
    return await fn(c);
  } catch {
    return null;
  } finally {
    await c.$disconnect().catch(() => {});
  }
}

type Summary = {
  varName: string;
  reachable: boolean;
  error?: string;
  total?: number;
  minDay?: string | null;
  maxDay?: string | null;
  distinctCards?: number;
  byCountry?: { country: string; rows: number; days: number; maxDay: string | null }[];
  cardIds?: string[];
};

async function surveyHistory(varName: string, url: string): Promise<Summary> {
  const out = await withClient(url, async (c) => {
    const total = Number(
      (await c.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "PriceHistory"`)[0].n,
    );
    const span = (
      await c.$queryRaw<{ mn: Date | null; mx: Date | null; cards: bigint }[]>`
        SELECT MIN("day") AS mn, MAX("day") AS mx, COUNT(DISTINCT "cardId")::bigint AS cards
        FROM "PriceHistory"`
    )[0];
    const byCountry = (
      await c.$queryRaw<{ country: string; rows: bigint; days: bigint; mx: Date | null }[]>`
        SELECT "country", COUNT(*)::bigint AS rows,
               COUNT(DISTINCT "day")::bigint AS days, MAX("day") AS mx
        FROM "PriceHistory" GROUP BY "country" ORDER BY "country"`
    ).map((r) => ({
      country: r.country,
      rows: Number(r.rows),
      days: Number(r.days),
      maxDay: r.mx ? r.mx.toISOString().slice(0, 10) : null,
    }));
    const ids = (
      await c.$queryRaw<{ cardId: string }[]>`SELECT DISTINCT "cardId" FROM "PriceHistory"`
    ).map((r) => r.cardId);
    return {
      total,
      minDay: span.mn ? span.mn.toISOString().slice(0, 10) : null,
      maxDay: span.mx ? span.mx.toISOString().slice(0, 10) : null,
      distinctCards: Number(span.cards),
      byCountry,
      cardIds: ids,
    };
  });
  if (!out) return { varName, reachable: false, error: "unreachable or no PriceHistory table" };
  return { varName, reachable: true, ...out };
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`=== PriceHistory survey — ${today} (READ-ONLY, nothing is written) ===\n`);

  // ── Live operational Card ids, for the orphan check ───────────────────────
  let liveCardIds: Set<string> | null = null;
  let liveVar = "";
  for (const v of OPERATIONAL_VARS) {
    const url = process.env[v];
    if (!url) continue;
    const ids = await withClient(url, async (c) =>
      (await c.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Card"`).map((r) => r.id),
    );
    if (ids) {
      liveCardIds = new Set(ids);
      liveVar = v;
      break;
    }
  }
  console.log(
    liveCardIds
      ? `Operational database for the orphan check: ${liveVar} (${liveCardIds.size.toLocaleString()} Card rows)\n`
      : "!! Could not reach ANY operational database — orphan check skipped.\n",
  );

  const summaries: Summary[] = [];
  for (const v of HISTORY_VARS) {
    const url = process.env[v];
    if (!url) {
      console.log(`${v.padEnd(24)} NOT SET`);
      continue;
    }
    const s = await surveyHistory(v, url);
    summaries.push(s);
    if (!s.reachable) {
      console.log(`${v.padEnd(24)} UNREACHABLE — ${s.error}`);
      continue;
    }
    const orphanNote =
      liveCardIds && s.cardIds
        ? (() => {
            const matched = s.cardIds.filter((id) => liveCardIds!.has(id)).length;
            const pct = s.cardIds.length ? Math.round((matched / s.cardIds.length) * 100) : 0;
            return `  cards matching ${liveVar}: ${matched}/${s.cardIds.length} (${pct}%)${
              pct === 0 && s.cardIds.length > 0 ? "   <<< ALL ORPHANED — history cannot join to any live card" : ""
            }`;
          })()
        : "";
    console.log(
      `${v.padEnd(24)} REACHABLE  rows=${(s.total ?? 0).toLocaleString().padStart(9)}  ` +
        `days=${s.minDay ?? "-"}..${s.maxDay ?? "-"}  distinctCards=${s.distinctCards}`,
    );
    if (orphanNote) console.log(orphanNote);
    for (const c of s.byCountry ?? []) {
      console.log(
        `    ${c.country.padEnd(3)} rows=${c.rows.toLocaleString().padStart(8)}  ` +
          `days=${String(c.days).padStart(4)}  latest=${c.maxDay ?? "-"}`,
      );
    }
    console.log("");
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  const reachable = summaries.filter((s) => s.reachable && (s.total ?? 0) > 0);
  if (!reachable.length) {
    console.log("No history database holds any PriceHistory rows.");
    return;
  }
  const byRows = [...reachable].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  const byRecency = [...reachable].sort((a, b) => (b.maxDay ?? "").localeCompare(a.maxDay ?? ""));
  const byDepth = [...reachable].sort((a, b) => (a.minDay ?? "9999").localeCompare(b.minDay ?? "9999"));
  console.log("=== VERDICT ===");
  console.log(`Most rows:      ${byRows[0].varName} (${(byRows[0].total ?? 0).toLocaleString()})`);
  console.log(`Most recent:    ${byRecency[0].varName} (latest ${byRecency[0].maxDay})`);
  console.log(`Deepest back:   ${byDepth[0].varName} (from ${byDepth[0].minDay})`);
  if (liveCardIds) {
    const usable = reachable
      .map((s) => ({
        v: s.varName,
        matched: (s.cardIds ?? []).filter((id) => liveCardIds!.has(id)).length,
      }))
      .sort((a, b) => b.matched - a.matched);
    console.log(`Most JOINABLE:  ${usable[0].v} (${usable[0].matched} cards resolve against ${liveVar})`);
    console.log(
      "\nJOINABLE is the number that matters. A project can hold millions of rows and still\n" +
        "render an empty chart if its cardIds do not exist in the operational database.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
