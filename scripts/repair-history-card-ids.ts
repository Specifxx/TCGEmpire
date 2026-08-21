/**
 * Re-keys a history project's card ids onto the LIVE operational catalogue.
 *
 * THE BUG. PriceHistory.cardId references Card.id, but history lives in a
 * different Neon project from the operational database, with no foreign key
 * between them. At some point the operational catalogue was REBUILT rather than
 * restored (see maintenance.yml's restore-accounts-into-rm5, "leaving RM5's
 * freshly-rebuilt Card/RetailerPrice catalogue untouched") — a rebuild mints a
 * fresh cuid for every card. From that moment every PriceHistory row in every
 * history project pointed at ids that no longer existed anywhere.
 *
 * Nothing errored. The tables stayed full, every row count stayed healthy, and
 * probe-databases reported all projects REACHABLE — while /api/v1/cards.json
 * returned [], every card page's chart went blank, and price movers silently
 * had nothing to rank. probe-history-dbs.ts measured it: 0% of cardIds in all
 * seven history projects resolve against the live catalogue.
 *
 * THE FIX. Each history project carries its own copy of the Card table, so the
 * old id → externalId mapping is available locally; externalId is the stable
 * business key (e.g. "ogn-303-star-298") and survives every rebuild. So:
 *
 *     history.Card.id → history.Card.externalId
 *                     → operational.Card.externalId → operational.Card.id
 *
 * and we rewrite history.Card.id to the operational id. PriceHistory follows
 * automatically IF the foreign key is ON UPDATE CASCADE (Prisma's default);
 * the script verifies that against information_schema rather than assuming it,
 * and refuses to run rather than half-applying if the rule is anything else.
 *
 * Old and new id sets are disjoint (measured: 0% overlap), so no primary-key
 * collision is possible during the rewrite.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. Pass --db=<VAR> to target a
 * specific history variable (default: whatever db-history.ts resolves).
 *
 * Usage:
 *   npx tsx scripts/repair-history-card-ids.ts                 # report only
 *   npx tsx scripts/repair-history-card-ids.ts --apply
 *   npx tsx scripts/repair-history-card-ids.ts --db=RH6 --apply
 */
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const DB_ARG = process.argv.find((a) => a.startsWith("--db="))?.slice(5);

const HISTORY_VARS = [
  "HISTORY_DATABASE_URL_4",
  "HISTORY_DATABASE_URL_3",
  "HISTORY_DATABASE_URL_2",
  "HISTORY_DATABASE_URL",
  "RH7",
  "RH6",
  "RH5",
];
// RM7/RM8 prepended 2026-08-21 — this list had gone stale at RM6 (missing the
// 2026-08-20 RM7 cutover entirely), which is exactly the "operational chain
// drifted from db-chains.ts" failure mode db-chains.ts's own header warns
// about. Kept as a superset (not the bare db-chains.ts OPERATIONAL_VARS) since
// this script's `pick()` is a best-effort "find ANY live operational database"
// for the externalId join, not a strict current-vs-dead diagnostic.
const OPERATIONAL_VARS = ["RM7", "RM8", "RM6", "DATABASE_URL_2", "DATABASE_URL", "RM5", "RM4", "RM3"];

function pick(vars: string[], forced?: string): { name: string; url: string } | null {
  const list = forced ? [forced] : vars;
  for (const v of list) {
    const url = process.env[v];
    if (url) return { name: v, url };
  }
  return null;
}

function clientFor(url: string) {
  return new PrismaClient({ datasources: { db: { url } }, log: ["error"] });
}

async function main() {
  const hist = pick(HISTORY_VARS, DB_ARG);
  const oper = pick(OPERATIONAL_VARS);
  if (!hist) throw new Error(`No history database URL available (looked for ${DB_ARG ?? HISTORY_VARS.join(", ")})`);
  if (!oper) throw new Error("No operational database URL available");

  console.log(`History target : ${hist.name}`);
  console.log(`Operational    : ${oper.name}`);
  console.log(`Mode           : ${APPLY ? "APPLY (will write)" : "DRY RUN (writes nothing)"}\n`);

  const h = clientFor(hist.url);
  const o = clientFor(oper.url);

  try {
    // ── 1. Confirm the FK will carry PriceHistory along ─────────────────────
    const rule = await h.$queryRaw<{ update_rule: string; constraint_name: string }[]>`
      SELECT rc.update_rule, rc.constraint_name
      FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.table_name = 'PriceHistory' AND tc.constraint_type = 'FOREIGN KEY'`;
    const cascade = rule.find((r) => r.update_rule === "CASCADE");
    console.log(
      `PriceHistory FK update rule: ${rule.map((r) => `${r.constraint_name}=${r.update_rule}`).join(", ") || "(none found)"}`,
    );
    if (!cascade && rule.length) {
      console.error(
        "\n!! The foreign key is NOT ON UPDATE CASCADE. Rewriting Card.id would orphan or block\n" +
          "   PriceHistory rather than carry them across. Refusing to run — this needs a manual\n" +
          "   migration that rewrites both tables in one transaction.",
      );
      process.exit(1);
    }

    // ── 2. Build the mapping via externalId ─────────────────────────────────
    const histCards = await h.$queryRaw<{ id: string; externalId: string | null }[]>`
      SELECT "id", "externalId" FROM "Card"`;
    const operCards = await o.$queryRaw<{ id: string; externalId: string | null }[]>`
      SELECT "id", "externalId" FROM "Card"`;
    console.log(`Cards in history copy : ${histCards.length.toLocaleString()}`);
    console.log(`Cards in live catalogue: ${operCards.length.toLocaleString()}`);

    const liveByExternal = new Map<string, string>();
    for (const c of operCards) if (c.externalId) liveByExternal.set(c.externalId, c.id);
    const liveIds = new Set(operCards.map((c) => c.id));

    const pairs: { old: string; neu: string }[] = [];
    let alreadyCorrect = 0;
    let noExternal = 0;
    let noMatch = 0;
    for (const c of histCards) {
      if (liveIds.has(c.id)) {
        alreadyCorrect++;
        continue;
      }
      if (!c.externalId) {
        noExternal++;
        continue;
      }
      const neu = liveByExternal.get(c.externalId);
      if (!neu) {
        noMatch++;
        continue;
      }
      pairs.push({ old: c.id, neu });
    }

    // How many PriceHistory rows does that actually rescue?
    const rescued = pairs.length
      ? Number(
          (
            await h.$queryRaw<{ n: bigint }[]>`
              SELECT COUNT(*)::bigint AS n FROM "PriceHistory"
              WHERE "cardId" = ANY(${pairs.map((p) => p.old)}::text[])`
          )[0].n,
        )
      : 0;
    const total = Number(
      (await h.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM "PriceHistory"`)[0].n,
    );

    console.log(`\n  already pointing at live ids : ${alreadyCorrect}`);
    console.log(`  remappable via externalId    : ${pairs.length}`);
    console.log(`  no externalId to match on    : ${noExternal}`);
    console.log(`  externalId absent from live  : ${noMatch}`);
    console.log(
      `\nPriceHistory rows recovered by this remap: ${rescued.toLocaleString()} of ${total.toLocaleString()}` +
        ` (${total ? Math.round((rescued / total) * 100) : 0}%)`,
    );

    if (!pairs.length) {
      console.log("\nNothing to remap.");
      return;
    }
    if (!APPLY) {
      console.log("\nDRY RUN — nothing written. Re-run with --apply to perform the remap.");
      return;
    }

    // ── 3. Rewrite Card.id; the FK cascades PriceHistory ────────────────────
    // Chunked so one oversized statement can't blow the parameter limit, and
    // wrapped per chunk so a failure leaves a consistent prefix rather than a
    // half-written row set.
    const CHUNK = 200;
    let done = 0;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const slice = pairs.slice(i, i + CHUNK);
      const values = slice.map((p) => `('${p.old}','${p.neu}')`).join(",");
      // ids are cuids from our own database (a-z0-9 only) — no quoting hazard,
      // and they are validated by the ANY(...) count above having matched rows.
      await h.$executeRawUnsafe(
        `UPDATE "Card" AS c SET "id" = m.new_id
         FROM (VALUES ${values}) AS m(old_id, new_id)
         WHERE c."id" = m.old_id`,
      );
      done += slice.length;
      console.log(`  remapped ${done}/${pairs.length} cards`);
    }

    // ── 4. Verify ───────────────────────────────────────────────────────────
    const after = await h.$queryRaw<{ cardId: string }[]>`SELECT DISTINCT "cardId" FROM "PriceHistory"`;
    const matched = after.filter((r) => liveIds.has(r.cardId)).length;
    console.log(
      `\nAFTER: ${matched}/${after.length} distinct history cardIds resolve against ${oper.name}` +
        ` (${after.length ? Math.round((matched / after.length) * 100) : 0}%)`,
    );
  } finally {
    await h.$disconnect().catch(() => {});
    await o.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
