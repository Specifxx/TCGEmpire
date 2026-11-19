// Card scanner, step 2: turn what the model READ off the photo into ONE printing of our catalogue, or none.
// Pure (no database, no network) so tests/scan-match.test.ts and the accuracy eval (scripts/scan-eval) run the
// exact code production runs. DECISIONS.md, 2026-11-19 "Card scanner beta".
//
// The model only reads text (name, set code, collector number, a promo stamp); it never picks a card id. The
// match is ours and deterministic: the printed collector number is the strongest key (it is what TCGplayer and
// Riot use to tell printings apart), the name must agree with it, and anything ambiguous comes back with a
// lower confidence and the other printings as "wrong card?" choices. A wrong card shown as certain is worse
// than asking the visitor to pick.

export interface ScanCatalogCard {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string; // "066/298", "066a/298", "299*/298"
  isPromo: boolean;
  variant: string | null;
  imageUrl?: string | null;
}

/** What the vision model read. Every field may be missing: the photo decides what is legible. */
export interface ScanReading {
  isTradingCard: boolean;
  game: string | null; // "riftbound", "pokemon", "magic", … as the model recognised it
  name: string | null;
  setCode: string | null;
  collectorNumber: string | null; // as printed, e.g. "066a/298"
  promoStamp: boolean; // a "Promo" / event stamp the model could see
}

export type ScanConfidence = "high" | "medium" | "low" | "none";

export interface ScanMatch {
  bestId: string | null;
  confidence: ScanConfidence;
  /** Other printings worth offering under "Wrong card?", best first, never including bestId. */
  alternateIds: string[];
  why: string;
}

const MAX_ALTERNATES = 8;

export function normName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*-\s*starter\b.*$/, "") // "Annie, Dark Child - Starter" is the starter deck's printing of the same name
    .replace(/[^a-z0-9]+/g, "");
}

/** The printed number as our catalogue writes it: zero-padded to 3, lower-case letter suffix, "*" kept. */
export function parseNumber(raw: string | null | undefined): { base: string; suffix: string; total: string | null } | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, "").replace(/[Oo](?=\d)/g, "0");
  const m = s.match(/(\d{1,3})([a-zA-Z*]?)(?:\/(\d{1,3}))?/);
  if (!m) return null;
  return { base: m[1].padStart(3, "0"), suffix: (m[2] ?? "").toLowerCase(), total: m[3] ? m[3].padStart(3, "0") : null };
}

function catalogNumber(c: ScanCatalogCard) {
  return parseNumber(c.collectorNumber) ?? { base: "", suffix: "", total: null };
}

/** Similarity of two normalised names, 0..1 (1 - Levenshtein / longer length). */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** A name read off the card agrees with a catalogue name: equal, or the card shows only the champion half. */
function nameScore(read: string, card: ScanCatalogCard): number {
  const full = normName(card.name);
  const s = nameSimilarity(read, full);
  // "Jinx, Loose Cannon": the model may return only "Loose Cannon" or only "Jinx".
  const parts = card.name.split(",").map((p) => normName(p)).filter(Boolean);
  const best = Math.max(s, ...parts.map((p) => (p.length >= 4 ? nameSimilarity(read, p) * 0.9 : 0)));
  return best;
}

/** Prefer, among printings that share a number and name, the one the stamp points to; else the base printing. */
function rankTwins(twins: ScanCatalogCard[], promo: boolean): ScanCatalogCard[] {
  return [...twins].sort((a, b) => {
    const pa = a.isPromo === promo ? 0 : 1;
    const pb = b.isPromo === promo ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const sa = /starter/i.test(a.name) ? 1 : 0; // a plain read is the booster printing, not the starter deck's
    const sb = /starter/i.test(b.name) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return a.id.localeCompare(b.id);
  });
}

export function matchScan(reading: ScanReading, catalog: ScanCatalogCard[]): ScanMatch {
  const none = (why: string): ScanMatch => ({ bestId: null, confidence: "none", alternateIds: [], why });
  if (!reading.isTradingCard) return none("no trading card in the photo");
  if (reading.game && !/rift/i.test(reading.game)) return none(`looks like ${reading.game}, not Riftbound`);

  const read = normName(reading.name);
  const num = parseNumber(reading.collectorNumber);
  const set = (reading.setCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || null;

  // Every printing of the name we read (any set), for the alternates and the name-only fallback.
  const byName = read
    ? catalog
        .map((c) => ({ c, s: nameScore(read, c) }))
        .filter((x) => x.s >= 0.72)
        .sort((x, y) => y.s - x.s)
    : [];

  if (num) {
    const sameNumber = catalog.filter((c) => {
      const n = catalogNumber(c);
      if (n.base !== num.base) return false;
      if (set && c.setCode !== set) return false;
      if (num.total && n.total && n.total !== num.total) return false;
      return true;
    });
    const exact = sameNumber.filter((c) => catalogNumber(c).suffix === num.suffix);
    const pool = exact.length ? exact : sameNumber;
    if (pool.length) {
      const scored = pool.map((c) => ({ c, s: read ? nameScore(read, c) : null }));
      const agreeing = scored.filter((x) => x.s === null || x.s >= 0.6).map((x) => x.c);
      if (agreeing.length) {
        const ranked = rankTwins(agreeing, reading.promoStamp);
        const best = ranked[0];
        const alt = uniq([...ranked.slice(1), ...sameNumber, ...byName.map((x) => x.c)].map((c) => c.id)).filter((id) => id !== best.id);
        const exactHit = exact.length > 0;
        const setKnown = !!set;
        const nameKnown = !!read;
        let confidence: ScanConfidence = exactHit && setKnown && nameKnown ? "high" : nameKnown || setKnown ? "medium" : "low";
        // Twins we cannot tell apart from the front alone (promo vs booster with the same art) stay "high" for the
        // card but the alternates carry the other printing; a different-suffix fallback is never high.
        if (!exactHit && confidence === "high") confidence = "medium";
        return { bestId: best.id, confidence, alternateIds: alt.slice(0, MAX_ALTERNATES), why: exactHit ? "number and name agree" : "number agrees, variant letter differs" };
      }
      // The number points one way, the name another: trust neither blindly.
      if (byName.length) {
        const ranked = rankByName(byName, set, reading.promoStamp);
        return {
          bestId: ranked[0].id,
          confidence: "low",
          alternateIds: uniq([...ranked.slice(1), ...pool].map((c) => c.id)).slice(0, MAX_ALTERNATES),
          why: "name and number disagree; going by the name",
        };
      }
      const ranked = rankTwins(pool, reading.promoStamp);
      return { bestId: ranked[0].id, confidence: "low", alternateIds: ranked.slice(1).map((c) => c.id).slice(0, MAX_ALTERNATES), why: "number only; the name did not match" };
    }
  }

  if (byName.length) {
    const ranked = rankByName(byName, set, reading.promoStamp);
    const top = byName[0].s;
    const distinctNames = new Set(byName.filter((x) => x.s >= top - 0.05).map((x) => normName(x.c.name)));
    const confidence: ScanConfidence = top >= 0.9 && distinctNames.size === 1 ? (ranked.length === 1 ? "high" : "medium") : "low";
    return { bestId: ranked[0].id, confidence, alternateIds: ranked.slice(1).map((c) => c.id).slice(0, MAX_ALTERNATES), why: "matched by name (number not legible)" };
  }
  return none("nothing in our catalogue matches what was read");
}

function rankByName(byName: { c: ScanCatalogCard; s: number }[], set: string | null, promo: boolean): ScanCatalogCard[] {
  const top = byName[0].s;
  const close = byName.filter((x) => x.s >= top - 0.05).map((x) => x.c);
  const inSet = set ? close.filter((c) => c.setCode === set) : [];
  const pool = inSet.length ? inSet : close;
  // Base printing (no letter, not overnumbered) before alt arts: the common copy is the likelier one in a hand.
  const sorted = [...pool].sort((a, b) => {
    const sa = catalogNumber(a).suffix ? 1 : 0;
    const sb = catalogNumber(b).suffix ? 1 : 0;
    return sa - sb;
  });
  const twinsFirst = rankTwins(sorted.filter((c) => !catalogNumber(c).suffix), promo);
  const rest = sorted.filter((c) => catalogNumber(c).suffix);
  return uniq([...twinsFirst, ...rest, ...byName.map((x) => x.c)].map((c) => c.id)).map((id) => [...pool, ...byName.map((x) => x.c)].find((c) => c.id === id)!);
}

/**
 * The printings a photo could be, when the number points at more than one PICTURE: same set and same number before
 * any letter or star, a different image. Best first, at most `max`, one card per distinct image. Empty when the best
 * card has no look-alike to tell apart (most cards), so no second call is made.
 */
export function visualTwins(bestId: string, catalog: ScanCatalogCard[], max = 4, readNumber?: string | null): ScanCatalogCard[] {
  const best = catalog.find((c) => c.id === bestId);
  if (!best?.imageUrl) return [];
  const base = catalogNumber(best).base;
  // A letter or star the model DID read is evidence the picture check must not overrule (eval v2: Ahri 303* read
  // right, then "corrected" to 303 by the pictures). Only a bare number leaves the letter open.
  const readSuffix = parseNumber(readNumber)?.suffix ?? "";
  const seen = new Set<string>([best.imageUrl]);
  const out = [best];
  for (const c of catalog) {
    if (c.id === best.id || c.setCode !== best.setCode || !c.imageUrl || seen.has(c.imageUrl)) continue;
    if (catalogNumber(c).base !== base) continue;
    if (readSuffix && catalogNumber(c).suffix !== readSuffix) continue;
    if (normName(c.name) !== normName(best.name) && nameSimilarity(normName(c.name), normName(best.name)) < 0.6) continue;
    seen.add(c.imageUrl);
    out.push(c);
  }
  return out.length > 1 ? out.slice(0, max) : [];
}

/**
 * Twins that share the full printed number and differ only in being the promo (eval v2: the picture check chose
 * wrong on 13 of 36 promo photos, because a promo's official image is often the same art). The photo cannot settle
 * these, so they are never "Match": the page asks which one with both shown.
 */
export function onlyPromoTwins(twins: ScanCatalogCard[]): boolean {
  if (twins.length < 2) return false;
  const n = (c: ScanCatalogCard) => `${catalogNumber(c).base}${catalogNumber(c).suffix}`;
  return twins.every((c) => n(c) === n(twins[0]));
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
