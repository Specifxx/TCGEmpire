import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseDeckList } from "@/lib/deck";
import { normalizeSearch } from "@/lib/format";
import { addCopies, collectionRowStore } from "@/lib/collection-add";
import { freeLimitBody } from "@/lib/free-limits";
import { portfolioAllowance } from "@/lib/free-limits-server";
import { matchCsvRows, parseCollectionCsv, type CsvMatch, type ParsedCollectionCsv } from "@/lib/collection-csv";

export const dynamic = "force-dynamic";
// The printing-aware path can write up to CSV_LINE_CAP lines, one guarded write
// each. Its own budget (WRITE_BUDGET_MS) stops well inside this, so a slow
// database ends in a REPORT of the lines not reached, never in a function killed
// mid-file with the response lost (a retry of a file half-written would add
// every quantity again).
export const maxDuration = 60;

/** The upload picker refuses files over this (MyCollection.tsx); the route holds the same line. */
const MAX_TEXT_CHARS = 500_000;

// Bulk-add cards to the collection from a pasted list (TCGplayer mass-entry style,
// e.g. "3 Jinx, Loose Cannon"). Matches by name (cheapest printing), adds each at
// NM/non-foil, incrementing quantity. Returns how many cards gained copies, the
// names already at the 999 cap (nothing added), any unmatched names so the
// user can fix them, and — for a free account at its portfolio limit — how many
// new cards were skipped (limitSkipped, freeLimit).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text: string = typeof body?.text === "string" ? body.text : "";
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: "That file is over 500 KB. Split it into two and import them one after the other." }, { status: 413 });
  }
  // A CSV whose header names a set and a number column takes the
  // printing-aware path below (2026-09-29): it keeps the printing, finish and
  // condition and reports every line it skipped. Anything else is a name list.
  const csv = parseCollectionCsv(text);
  if (csv) return importPrintings(user, csv);
  const lines = parseDeckList(text).slice(0, 300).filter((l) => l.name);
  if (!lines.length) return NextResponse.json({ error: "Paste a list like “3 Jinx, Loose Cannon”." }, { status: 400 });

  const nqs = [...new Set(lines.map((l) => normalizeSearch(l.name)))];
  const cards = await prisma.card.findMany({
    where: { nameNormalized: { in: nqs }, isPromo: false },
    select: { id: true, nameNormalized: true, variant: true },
  });
  // Prefer the base print (variant null) when a name has several printings.
  const byName = new Map<string, string>();
  for (const c of cards) {
    if (!byName.has(c.nameNormalized) || c.variant == null) byName.set(c.nameNormalized, c.id);
  }

  // Merge duplicate lines into a single quantity per card.
  const qtyByCard = new Map<string, number>();
  const nameByCard = new Map<string, string>(); // as the user typed it, for the "full" list
  const unmatched: string[] = [];
  for (const l of lines) {
    const cardId = byName.get(normalizeSearch(l.name));
    if (!cardId) {
      unmatched.push(l.name);
      continue;
    }
    qtyByCard.set(cardId, (qtyByCard.get(cardId) ?? 0) + l.qty);
    if (!nameByCard.has(cardId)) nameByCard.set(cardId, l.name);
  }

  // Rows this import lands on, read once: every line is NM/non-foil, so these
  // are the rows addCopies writes below. One capped query (≤ 300 ids), three
  // narrow columns, handed to addCopies as its first read — the same rule as
  // the single-card POST (lib/collection-add.ts): adding copies to a row that
  // records a TOTAL scales that total with the count instead of treating the new
  // copies as free, a row with no recorded cost stays unknown, the row never
  // passes the 999 cap, and each write is one guarded increment, so a POST that
  // lands mid-import is counted rather than overwritten.
  // THE FREE PORTFOLIO LIMIT (lib/free-limits.ts, 2026-09-28). A free
  // account's import adds every card it already holds, then new cards in the
  // order they were pasted until FREE_PORTFOLIO_LIMIT distinct cards, and
  // reports the rest as skipped — never a silent partial import, and never an
  // all-or-nothing refusal that loses the cards that did fit.
  const allowance = await portfolioAllowance(prisma, user, [...qtyByCard.keys()]);
  const limitSkipped = allowance.blocked.map((id) => nameByCard.get(id) ?? id);
  for (const id of allowance.blocked) qtyByCard.delete(id);

  const ids = [...qtyByCard.keys()];
  // No `.catch(() => [])`: an empty answer here would silently take the old
  // "new copies are free" path. A failed read fails the import instead.
  const existingRows = ids.length
    ? await prisma.collectionCard.findMany({
        where: { userId: user.id, cardId: { in: ids }, condition: "NM", isFoil: false },
        select: { cardId: true, quantity: true, costBasisCents: true, costBasisIsTotal: true },
        take: ids.length,
      })
    : [];
  const existingBy = new Map(existingRows.map((r) => [r.cardId, r]));

  let added = 0;
  const full: string[] = [];
  for (const [cardId, qty] of qtyByCard) {
    const store = collectionRowStore(prisma, { userId: user.id, cardId, condition: "NM", isFoil: false });
    const res = await addCopies(store, { quantity: qty }, { existing: existingBy.get(cardId) ?? null }).catch(() => null);
    if (res?.status === "added") added++;
    // Already at the cap: nothing changed, so it is not counted as added.
    else if (res?.status === "full") full.push(nameByCard.get(cardId) ?? cardId);
  }

  return NextResponse.json({
    ok: true,
    added,
    matchedCards: qtyByCard.size + allowance.blocked.length,
    // Cards not added because the free portfolio is full (their names, up to
    // 30), with the structured limit for the upgrade panel. Absent when none.
    ...(allowance.blocked.length
      ? {
          limitSkipped: allowance.blocked.length,
          limitSkippedNames: limitSkipped.slice(0, 30),
          freeLimit: freeLimitBody("portfolio", allowance.count ?? allowance.limit),
        }
      : {}),
    full: full.slice(0, 30),
    unmatched: [...new Set(unmatched)].slice(0, 30),
  });
}

// THE PRINTING-AWARE PATH (lib/collection-csv.ts, 2026-09-29). Free like every
// way of entering your own binder. One line names one printing (set + collector
// number), at a finish and condition, so an alt-art or a Signature lands as
// itself, not as its base card. The same free-limit rule as the name path
// (lib/free-limits.ts): every already-held card, then new cards in file order
// until the limit, the rest reported, never a silent partial import.
//
// Reads: the referenced sets' catalogue once (narrow columns, at most the sets
// named in the file, capped), the account's rows for the matched cards once,
// then one guarded write per line (lib/collection-add.ts), exactly like the
// name path, WRITE_CONCURRENCY at a time (different rows: the lines are merged
// per printing, finish and condition, so no two writes touch one row).
const CATALOGUE_TAKE = 3000;
const LIST_CAP = 30;
const WRITE_CONCURRENCY = 8;
const WRITE_BUDGET_MS = 40_000;

async function importPrintings(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, csv: ParsedCollectionCsv) {
  if (csv.rows.length === 0) {
    return NextResponse.json(
      {
        error: "No lines could be imported from that file.",
        skippedCount: csv.skippedCount,
        skipped: csv.skipped.slice(0, LIST_CAP),
      },
      { status: 400 },
    );
  }

  const sets = [...new Set(csv.rows.map((r) => r.setCode))];
  const catalogue = await prisma.card.findMany({
    where: { setCode: { in: sets }, isPromo: false },
    select: { id: true, setCode: true, collectorNumber: true, isPromo: true },
    take: CATALOGUE_TAKE,
  });
  const { matched, unmatched } = matchCsvRows(csv.rows, catalogue);

  const labelOf = (m: CsvMatch) => m.copy.name ?? `${m.copy.setCode} ${m.copy.number}`;
  const nameByCard = new Map<string, string>();
  for (const m of matched) if (!nameByCard.has(m.card.id)) nameByCard.set(m.card.id, labelOf(m));

  // Distinct cards in file order; the limit takes already-held cards first.
  const allowance = await portfolioAllowance(prisma, user, [...new Set(matched.map((m) => m.card.id))]);
  const blocked = new Set(allowance.blocked);
  const limitSkipped = allowance.blocked.map((id) => nameByCard.get(id) ?? id);
  const writable = matched.filter((m) => !blocked.has(m.card.id));

  const ids = [...new Set(writable.map((m) => m.card.id))];
  // No `.catch(() => [])`: an empty answer would silently take the "new copies
  // are free" path. A failed read fails the import instead.
  const existingRows = ids.length
    ? await prisma.collectionCard.findMany({
        where: { userId: user.id, cardId: { in: ids } },
        select: { cardId: true, condition: true, isFoil: true, quantity: true, costBasisCents: true, costBasisIsTotal: true },
        take: ids.length * 10, // 5 conditions x 2 finishes a card
      })
    : [];
  const rowKey = (cardId: string, condition: string, isFoil: boolean) => `${cardId}|${condition}|${isFoil ? 1 : 0}`;
  const existingBy = new Map(existingRows.map((r) => [rowKey(r.cardId, r.condition, r.isFoil), r]));

  let added = 0;
  let copies = 0;
  const full: string[] = [];
  const failed: string[] = [];
  const landed = new Set<string>();
  const deadline = Date.now() + WRITE_BUDGET_MS;
  for (let i = 0; i < writable.length; i += WRITE_CONCURRENCY) {
    const batch = writable.slice(i, i + WRITE_CONCURRENCY);
    // Out of time: nothing more is written, and every line not reached is
    // reported below as not saved, so the member re-imports just those.
    if (Date.now() > deadline) {
      for (const m of batch) failed.push(labelOf(m));
      continue;
    }
    const results = await Promise.all(
      batch.map((m) => {
        const key = { userId: user.id, cardId: m.card.id, condition: m.copy.condition, isFoil: m.copy.isFoil };
        const store = collectionRowStore(prisma, key);
        return addCopies(store, { quantity: m.copy.qty }, { existing: existingBy.get(rowKey(m.card.id, key.condition, key.isFoil)) ?? null }).catch(() => null);
      }),
    );
    batch.forEach((m, j) => {
      const res = results[j];
      if (res?.status === "added") {
        added++;
        copies += res.added;
        landed.add(m.card.id);
      } else if (res?.status === "full") full.push(labelOf(m));
      else failed.push(labelOf(m));
    });
  }

  return NextResponse.json({
    ok: true,
    format: "csv",
    added,
    copies,
    // Distinct cards this file put into the binder (a foil and a normal copy of
    // one card are two entries but one card).
    cards: landed.size,
    matchedCards: new Set(matched.map((m) => m.card.id)).size,
    ...(allowance.blocked.length
      ? {
          limitSkipped: allowance.blocked.length,
          limitSkippedNames: limitSkipped.slice(0, LIST_CAP),
          freeLimit: freeLimitBody("portfolio", allowance.count ?? allowance.limit),
        }
      : {}),
    full: full.slice(0, LIST_CAP),
    // Busy (lost a write race four times) or failed: nothing was written.
    failed: failed.slice(0, LIST_CAP),
    failedCount: failed.length,
    // Lines that are not a printing we track come back in `skipped` with their
    // reason, beside the lines that could not be read; `unmatched` is the name
    // path's field and stays empty here so nothing is listed twice.
    unmatched: [],
    skippedCount: csv.skippedCount + unmatched.length,
    skipped: [...csv.skipped, ...unmatched]
      .sort((a, b) => a.line - b.line)
      .slice(0, LIST_CAP)
      .map((s) => ({ line: s.line, reason: s.reason, text: s.text })),
    conditionDefaulted: csv.conditionDefaulted,
  });
}
