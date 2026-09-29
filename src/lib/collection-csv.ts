// THE PRINTING-AWARE BINDER IMPORT (2026-09-29, DECISIONS.md, "Set tracker").
//
// The paste import (/api/collection/import) matches a card by NAME and takes the
// base print at Near Mint, non-foil, so a collector could not bring in a real
// binder: an alt-art, a Signature or a foil all landed as the base card, and the
// set tracker would under-count on first use. This is the path that keeps the
// printing: a CSV with a SET CODE and a COLLECTOR NUMBER on every line, plus
// optionally a finish, a condition and a quantity.
//
// It is FREE, like every way of entering your own binder. It is also the one
// place a set collector starts, so it says what it skipped and why, line by
// line, rather than quietly importing part of a file.
//
// FORMATS. RiftCompare's own export (`name,set,number,condition,foil,quantity,…`,
// its TOTAL row ignored) round-trips through it, and so does any CSV, TSV or
// semicolon file whose header names a set column and a number column. No other
// tool's export is promised: a header is recognised by its words, and a file
// that names neither a set nor a number is not treated as a printing CSV at all
// (parseCollectionCsv returns null and the caller reads the text as a name
// list, exactly as before).
//
// Pure: no database, no Next. The route reads the catalogue and hands it to
// matchCsvRows; tests/collection-csv.test.ts drives both without a database.
import { SETS, normaliseCondition } from "./constants";

/** One requested line: N copies of one printing, at one finish and condition. */
export interface CsvCopy {
  /** Our set code, "OGN". */
  setCode: string;
  /** The number as typed, for messages: "001/298", "112a", "OGN-223*". */
  number: string;
  /** numberKey(number): "1", "112a", "223*". */
  key: string;
  qty: number;
  isFoil: boolean;
  /** NM, LP, MP, HP or DMG. */
  condition: string;
  /** 1-based line in the pasted text, for the skipped list. */
  line: number;
  /** The card name column, when the file has one (never used to match). */
  name: string | null;
}

export interface CsvSkip {
  line: number;
  reason: string;
  /** The line's text, trimmed to 80 characters. */
  text: string;
}

export interface ParsedCollectionCsv {
  rows: CsvCopy[];
  /** The first SKIP_STORE_CAP skipped lines, in file order. */
  skipped: CsvSkip[];
  /** Every skipped line, stored or not: a huge file allocates no more than the cap. */
  skippedCount: number;
  /** Rows whose condition was filled in but not understood: imported as Near Mint. */
  conditionDefaulted: number;
}

/** Most data lines one import reads; the rest are reported, never dropped silently. */
export const CSV_LINE_CAP = 2000;
/** Skipped lines kept with their reason; the rest are only counted (the response names 30). */
const SKIP_STORE_CAP = 500;
/** Most copies one line may ask for; the collection row holds 999 (QUANTITY_CAP). */
const QTY_CAP = 999;

/**
 * A collector number reduced to what identifies a printing inside its set:
 * "001/298" and "1" and "OGN-001" are card 1; "112a/298" is the alt-art "112a";
 * "223*" over 221 is the Signature "223*"; Vendetta's "SP1" and "VEN-SP1" are the Crystal Rose "sp1". The denominator, leading zeros and case
 * are not part of the identity.
 */
export function numberKey(raw: string): string {
  let n = raw.trim().toLowerCase();
  n = n.replace(/^[a-z]{2,4}[-\s]+(?=\d|sp\d)/, ""); // "ogn-001", "ogn 001", "ven-sp1"
  n = n.split("/")[0].trim();
  // A Crystal Rose (Vendetta's SP1 to SP6) is "sp" and a number, never a plain one.
  const rose = n.match(/^sp0*(\d+)$/);
  if (rose) return `sp${rose[1]}`;
  const m = n.match(/^0*(\d+)([a-z]?)(\*?)$/);
  return m ? `${m[1]}${m[2]}${m[3]}` : n;
}

// ── Delimited text ───────────────────────────────────────────────────────────

/** One delimited line into cells, honouring "quoted, cells" and "" escapes. */
export function splitCells(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && cur === "") quoted = true;
    else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(header: string): string {
  let best = ",";
  let most = 0;
  for (const d of [",", "\t", ";"]) {
    const n = header.split(d).length - 1;
    if (n > most) {
      best = d;
      most = n;
    }
  }
  return best;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]/g, "");

const SET_HEADERS = new Set(["set", "setcode", "setabbr", "setabbreviation", "edition", "editioncode", "expansion", "expansioncode"]);
const NUMBER_HEADERS = new Set(["number", "cardnumber", "collectornumber", "collectorno", "collector", "no", "num", "cardno", "#"]);
const QTY_HEADERS = new Set(["quantity", "qty", "count", "copies", "amount", "owned"]);
const FOIL_HEADERS = new Set(["foil", "finish", "printing", "isfoil"]);
const COND_HEADERS = new Set(["condition", "cond", "grade"]);
const NAME_HEADERS = new Set(["name", "cardname", "card"]);

interface Columns {
  set: number;
  number: number;
  qty: number;
  foil: number;
  cond: number;
  name: number;
}

function findColumns(cells: string[]): Columns | null {
  const idx = (want: Set<string>) => cells.findIndex((c) => want.has(norm(c)));
  const cols: Columns = {
    set: idx(SET_HEADERS),
    number: idx(NUMBER_HEADERS),
    qty: idx(QTY_HEADERS),
    foil: idx(FOIL_HEADERS),
    cond: idx(COND_HEADERS),
    name: idx(NAME_HEADERS),
  };
  return cols.set >= 0 && cols.number >= 0 ? cols : null;
}

const TRUTHY = new Set(["foil", "foiled", "yes", "y", "true", "1", "x"]);
const FALSY = new Set(["", "no", "n", "false", "0", "normal", "regular", "standard", "nonfoil", "non-foil", "non foil", "none"]);

/** A set code, set name or set slug, case-insensitively, to our set code. */
export function resolveSetCode(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const s = SETS.find((x) => x.code.toLowerCase() === t || x.name.toLowerCase() === t || x.slug === t);
  return s?.code ?? null;
}

const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);

/**
 * Read a pasted or uploaded CSV. Null when the first non-empty line is not a
 * header naming a set column and a number column (so the caller falls back to
 * the name-list import). Otherwise every data line is either a CsvCopy or a
 * CsvSkip with its reason; nothing is dropped without being listed.
 */
export function parseCollectionCsv(text: string): ParsedCollectionCsv | null {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0) return null;
  const delim = detectDelimiter(lines[first]);
  const cols = findColumns(splitCells(lines[first], delim));
  if (!cols) return null;

  const rows: CsvCopy[] = [];
  const skipped: CsvSkip[] = [];
  let skippedCount = 0;
  const skip = (s: CsvSkip) => {
    skippedCount++;
    if (skipped.length < SKIP_STORE_CAP) skipped.push(s);
  };
  let conditionDefaulted = 0;
  let read = 0;
  const merged = new Map<string, CsvCopy>();

  for (let i = first + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const line = i + 1;
    if (++read > CSV_LINE_CAP) {
      skip({ line, reason: `over the ${CSV_LINE_CAP}-line limit for one import; paste the rest as a second file`, text: clip(raw.trim()) });
      continue;
    }
    const cells = splitCells(raw, delim);
    const cell = (c: number) => (c >= 0 ? (cells[c] ?? "") : "");
    const setRaw = cell(cols.set);
    const numRaw = cell(cols.number);
    const name = cell(cols.name) || null;

    // RiftCompare's own export ends with "TOTAL,,,,,,,123.45": not a card.
    if (!setRaw && !numRaw && (name ?? cells[0] ?? "").toUpperCase() === "TOTAL") continue;
    if (!setRaw) {
      skip({ line, reason: "no set", text: clip(raw.trim()) });
      continue;
    }
    const setCode = resolveSetCode(setRaw);
    if (!setCode) {
      skip({ line, reason: `set "${setRaw}" is not one we track`, text: clip(raw.trim()) });
      continue;
    }
    if (!numRaw) {
      skip({ line, reason: "no collector number", text: clip(raw.trim()) });
      continue;
    }
    const key = numberKey(numRaw);
    if (!/^(\d+[a-z]?\*?|sp\d+)$/.test(key)) {
      skip({ line, reason: `collector number "${numRaw}" not understood`, text: clip(raw.trim()) });
      continue;
    }

    let qty = 1;
    const qRaw = cell(cols.qty);
    if (qRaw !== "") {
      const q = Number(qRaw);
      if (!Number.isInteger(q) || q < 1) {
        skip({ line, reason: `quantity "${qRaw}" is not a whole number of 1 or more`, text: clip(raw.trim()) });
        continue;
      }
      qty = Math.min(QTY_CAP, q);
    }

    const fRaw = cell(cols.foil).trim().toLowerCase();
    let isFoil = false;
    if (TRUTHY.has(fRaw)) isFoil = true;
    else if (!FALSY.has(fRaw)) {
      skip({ line, reason: `finish "${cell(cols.foil)}" not understood (use foil or normal)`, text: clip(raw.trim()) });
      continue;
    }

    const cRaw = cell(cols.cond);
    const cond = normaliseCondition(cRaw);
    // A blank cell is Near Mint by convention, not a surprise; only a grade we cannot read is reported.
    if (!cond && cRaw.trim() !== "") conditionDefaulted++;

    // The same printing, finish and condition on two lines is one entry.
    const mk = `${setCode}|${key}|${isFoil ? 1 : 0}|${cond ?? "NM"}`;
    const prev = merged.get(mk);
    if (prev) {
      prev.qty = Math.min(QTY_CAP, prev.qty + qty);
      continue;
    }
    const copy: CsvCopy = { setCode, number: numRaw, key, qty, isFoil, condition: cond ?? "NM", line, name };
    merged.set(mk, copy);
    rows.push(copy);
  }
  return { rows, skipped, skippedCount, conditionDefaulted };
}

// ── Matching lines to Card rows ──────────────────────────────────────────────

/** The catalogue fields a match reads. */
export interface CatalogueCard {
  id: string;
  setCode: string;
  collectorNumber: string;
  isPromo?: boolean | null;
}

export interface CsvMatch {
  card: CatalogueCard;
  copy: CsvCopy;
}

export interface MatchedCsv {
  matched: CsvMatch[];
  /** Lines whose set and number are not in our catalogue. */
  unmatched: CsvSkip[];
}

/**
 * Pair each line with the printing it names. A promo shares its base card's
 * number, and a file cannot say "promo", so promos are never the target: the
 * printing is the non-promo Card whose (set, number key) matches.
 */
export function matchCsvRows(rows: readonly CsvCopy[], catalogue: readonly CatalogueCard[]): MatchedCsv {
  const byKey = new Map<string, CatalogueCard>();
  for (const c of catalogue) {
    if (c.isPromo) continue;
    const k = `${c.setCode}|${numberKey(c.collectorNumber)}`;
    if (!byKey.has(k)) byKey.set(k, c);
  }
  const matched: CsvMatch[] = [];
  const unmatched: CsvSkip[] = [];
  for (const copy of rows) {
    const card = byKey.get(`${copy.setCode}|${copy.key}`);
    if (card) matched.push({ card, copy });
    else unmatched.push({ line: copy.line, reason: `${copy.setCode} ${copy.number} is not a printing we track`, text: `${copy.setCode} ${copy.number}${copy.name ? ` ${copy.name}` : ""}` });
  }
  return { matched, unmatched };
}
