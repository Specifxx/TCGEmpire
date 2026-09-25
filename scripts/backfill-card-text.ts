/**
 * BACKFILL PRINTED RULES TEXT for Origins, Proving Grounds, Spiritforged and
 * Unleashed, from Riot's own card gallery.
 *
 * FILL-ONLY. Writes `Card.description` where it is NULL and nowhere else. Never
 * creates a row, never touches any other column, never overwrites text that is
 * already there.
 *
 * ── DO NOT "FIX" THIS WITH set-pipeline ─────────────────────────────────────
 * Never dispatch maintenance.yml's `set-pipeline` (scripts/fetch-set-official.ts
 * + scripts/import-set-cards.ts) for OGN/OGS/SFD/UNL to get this text. That
 * importer keys its rows as `${code}-official-${galleryId}`; these four sets were
 * catalogued by RiftScribe (scripts/sync-cards.ts) under the bare gallery id
 * ("ogn-251-298"), so every one of the ~950 gallery cards would miss its
 * existing row and be CREATED again — ~950 duplicate card pages with new slugs,
 * no price history and the same title as the live URL they copy.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * Until this ran, `Card.description` was populated only for Vendetta (and
 * whatever later set went through the gallery importer). RiftScribe's snapshot
 * carries no rules text and sync-cards' mapCard() never writes the column, so
 * two-thirds of /card/* printed no rules text, and every /keywords/* page could
 * only list Vendetta cards (lib/keywords.ts scoped them all to VEN for exactly
 * this reason). mapCard() still never writes `description`, so a later
 * cards-sync cannot wipe what this fills.
 *
 * ── HOW ─────────────────────────────────────────────────────────────────────
 *  - ONE plain GET of https://playriftbound.com/en-us/card-gallery/. Its
 *    __NEXT_DATA__ carries every released card (1,189 on 2026-09-25: OGN 352,
 *    SFD 288, UNL 288, VEN 237, OGS 24) — no Playwright, no filter clicking.
 *  - The gallery `id` IS `Card.externalId` for RiftScribe-catalogued sets. A
 *    match needs that exact id AND the name AND the collector number to agree;
 *    anything else is reported and left alone. There is deliberately no fuzzy
 *    fallback: a TCGplayer promo row ("tcg-678049") shares its base card's name
 *    and collector number, and matching on those would be guessing.
 *  - The text is the gallery image's accessibility text minus its
 *    "Riftbound <Type>: <Name>. " prefix — the SAME source and format the
 *    Vendetta rows were imported from (fetch-set-official.ts parseAlt), with the
 *    printed markers in brackets ("[Tank]", "[Accelerate]", "[1][C]"). Every
 *    predicate in lib/keywords.ts and KeywordText depends on that format, so
 *    before writing anything the run re-derives the text for the Vendetta rows
 *    already in the database and REFUSES TO APPLY unless it reproduces them.
 *
 * DRY RUN BY DEFAULT. Writes only with --apply, and never while DRY_RUN=1.
 *
 *   npx tsx scripts/backfill-card-text.ts               # report only
 *   SET=UNL npx tsx scripts/backfill-card-text.ts       # one set
 *   npx tsx scripts/backfill-card-text.ts --apply       # write
 *
 * Run in CI via .github/workflows/maintenance.yml (task: backfill-card-text,
 * `apply` input). The report lands in the job summary.
 *
 * EGRESS: one read of ~1,190 short rows (the four sets plus the Vendetta
 * canary), then one UPDATE per filled row. Card pages already select
 * `description`, so this adds no read path; purging them afterwards re-renders
 * each once, comparable to a single deploy.
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normalizeSearch, clampText } from "../src/lib/format";
import { cardMetaDescription } from "../src/lib/card-seo";
import { cardDisplayName } from "../src/lib/card-name";
import { printingFieldsFrom, printingKind } from "../src/lib/content/card-narrative";
import { SETS } from "../src/lib/constants";

export const GALLERY_URL = "https://playriftbound.com/en-us/card-gallery/";
export const BACKFILL_SETS = ["OGN", "OGS", "SFD", "UNL"] as const;
// The Vendetta rows already hold gallery-derived text; they are the format canary.
const CANARY_SET = "VEN";
// Share of canary rows the re-derived text must reproduce EXACTLY. Not 100%:
// Riot occasionally corrects a card's text in the gallery after we imported it,
// and that is not a format change.
export const CANARY_MIN_AGREEMENT = 0.9;
const CANARY_MIN_ROWS = 20;

export interface GalleryCard {
  id: string; // "ogn-251-298" — lowercased
  setCode: string; // "OGN"
  name: string; // "Ahri, Inquisitive" — name + subtitle, as printed
  champion: string | null; // first gallery tag — the champion, on a Legend
  type: string; // "Legend", "Unit", … ("" for tokens)
  publicCode: string; // "OGN-251/298"
  text: string | null; // printed rules text, bracket format; null when none
}

/**
 * The rules text from a gallery image's accessibility text,
 * "Riftbound Unit: Ahri, Inquisitive. When I attack…".
 *
 * Strips the known name rather than splitting at the first ". " the way
 * fetch-set-official.ts's parseAlt does: the two agree for every name without a
 * full stop in it, and this one is also right for "Dr. Mundo, Expert" and
 * "B.F. Sword", where the first ". " falls inside the name.
 */
export function rulesFromAlt(alt: string, fullName: string): string | null {
  const m = alt.match(/^Riftbound\s+[^:]*:\s+([\s\S]+)$/);
  if (!m) return null;
  const rest = m[1];
  let rules: string;
  if (fullName && rest.startsWith(`${fullName}.`)) {
    rules = rest.slice(fullName.length + 1);
  } else {
    const dot = rest.indexOf(". ");
    rules = dot === -1 ? "" : rest.slice(dot + 2);
  }
  rules = rules.trim();
  if (!rules || rules === "[NO TEXT]") return null;
  return rules;
}

/** Every card object in the gallery's __NEXT_DATA__ (schema: see fetch-set-official.ts). */
export function galleryCardsFrom(nextData: unknown): GalleryCard[] {
  const out: GalleryCard[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, any>;
    const setId = o?.set?.value?.id;
    if (typeof o.id === "string" && typeof o.name === "string" && o.cardImage && typeof setId === "string") {
      const id = o.id.toLowerCase();
      if (!seen.has(id)) {
        seen.add(id);
        const subtitle = typeof o.subtitle === "string" && o.subtitle.trim() ? o.subtitle.trim() : "";
        const name = subtitle ? `${o.name.trim()}, ${subtitle}` : o.name.trim();
        out.push({
          id,
          setCode: setId.toUpperCase(),
          name,
          champion: typeof o?.tags?.tags?.[0] === "string" ? o.tags.tags[0] : null,
          type: String(o?.cardType?.type?.[0]?.label ?? ""),
          publicCode: typeof o.publicCode === "string" ? o.publicCode : "",
          text: rulesFromAlt(String(o.cardImage?.accessibilityText ?? ""), name),
        });
      }
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(nextData);
  return out;
}

export function nextDataFromHtml(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("the gallery page has no __NEXT_DATA__ script — its markup changed");
  return JSON.parse(m[1]);
}

/** "OGN-066a/298" and "066a/298" → "066a/298"; "UNL-T01" → "t01". */
export function normCollector(code: string): string {
  return code.trim().replace(/^[A-Za-z]+-/, "").toLowerCase();
}

/**
 * Names the database may hold for this gallery card. sync-cards (and the
 * gallery importer) name a Legend "Champion, Epithet" — "Jinx, Loose Cannon" —
 * where the gallery names it "Loose Cannon" and tags it "Jinx".
 */
export function nameCandidates(g: GalleryCard): string[] {
  const names = [g.name];
  // Legends only: on every other card the first tag is a region or a tribe
  // ("Ionia", "Mech"), not a name.
  if (g.type === "Legend" && g.champion && !g.name.toLowerCase().startsWith(g.champion.toLowerCase())) {
    names.push(`${g.champion}, ${g.name}`);
  }
  return names.map(normalizeSearch);
}

export interface DbCardText {
  id: string;
  externalId: string | null;
  name: string;
  collectorNumber: string;
  description: string | null;
}

export interface BackfillPlan<T extends DbCardText> {
  updates: { card: T; gallery: GalleryCard; text: string }[];
  alreadyFilled: number; // matched, but the row already has text: left untouched
  noText: number; // matched, but the card prints no rules text (runes, some battlefields)
  nameMismatch: { card: T; gallery: GalleryCard }[];
  collectorMismatch: { card: T; gallery: GalleryCard }[];
  unmatched: T[]; // no gallery card carries this row's externalId
  galleryWithoutRow: GalleryCard[];
}

/** `gallery` should already be narrowed to the sets `rows` covers. */
export function planBackfill<T extends DbCardText>(rows: T[], gallery: GalleryCard[]): BackfillPlan<T> {
  const byId = new Map(gallery.map((g) => [g.id, g]));
  const plan: BackfillPlan<T> = {
    updates: [], alreadyFilled: 0, noText: 0, nameMismatch: [], collectorMismatch: [], unmatched: [], galleryWithoutRow: [],
  };
  const used = new Set<string>();
  for (const card of rows) {
    const g = card.externalId ? byId.get(card.externalId.toLowerCase()) : undefined;
    if (!g) {
      plan.unmatched.push(card);
      continue;
    }
    used.add(g.id);
    if (!nameCandidates(g).includes(normalizeSearch(card.name))) {
      plan.nameMismatch.push({ card, gallery: g });
      continue;
    }
    if (normCollector(card.collectorNumber) !== normCollector(g.publicCode)) {
      plan.collectorMismatch.push({ card, gallery: g });
      continue;
    }
    if (card.description != null) {
      plan.alreadyFilled++;
      continue;
    }
    if (!g.text) {
      plan.noText++;
      continue;
    }
    plan.updates.push({ card, gallery: g, text: g.text });
  }
  plan.galleryWithoutRow = gallery.filter((g) => !used.has(g.id));
  return plan;
}

/**
 * Does the gallery text, derived exactly as above, reproduce what the Vendetta
 * rows already hold? Vendetta rows carry either the bare gallery id (adopted by
 * sync-cards) or the importer's "ven-official-<id>".
 */
export function formatCanary(venRows: DbCardText[], gallery: GalleryCard[]) {
  const byId = new Map(gallery.map((g) => [g.id, g]));
  let compared = 0;
  let equal = 0;
  const diffs: { externalId: string; stored: string; derived: string }[] = [];
  for (const r of venRows) {
    if (!r.description || !r.externalId) continue;
    const id = r.externalId.toLowerCase().replace(/^[a-z]+-official-/, "");
    const g = byId.get(id);
    if (!g?.text) continue;
    compared++;
    if (g.text === r.description) equal++;
    else diffs.push({ externalId: r.externalId, stored: r.description, derived: g.text });
  }
  const ok = compared >= CANARY_MIN_ROWS && equal / compared >= CANARY_MIN_AGREEMENT;
  return { compared, equal, ok, diffs };
}

// ── run ─────────────────────────────────────────────────────────────────────

const oneLine = (s: string, n = 110) => clampText(s, n).replace(/\|/g, "\\|");

async function main() {
  const APPLY = process.argv.includes("--apply") && process.env.DRY_RUN !== "1";
  // SET narrows the run; a slug ("unleashed") or a code ("UNL") both work, as
  // they do for set-pipeline's set_slug input, which this task shares.
  const rawSet = (process.env.SET ?? "").trim().toLowerCase();
  const only = rawSet ? (SETS.find((s) => s.slug === rawSet || s.code.toLowerCase() === rawSet)?.code ?? rawSet).toUpperCase() : "";
  const sets: string[] = only ? [only] : [...BACKFILL_SETS];
  if (only && !(BACKFILL_SETS as readonly string[]).includes(only)) {
    console.error(`SET=${only} is not one of ${BACKFILL_SETS.join(", ")}.`);
    process.exit(1);
  }

  const res = await fetch(GALLERY_URL, { headers: { "user-agent": "Mozilla/5.0 (RiftCompare card-text backfill)" } });
  if (!res.ok) throw new Error(`gallery fetch failed: HTTP ${res.status}`);
  const gallery = galleryCardsFrom(nextDataFromHtml(await res.text()));
  const bySet = new Map<string, number>();
  for (const g of gallery) bySet.set(g.setCode, (bySet.get(g.setCode) ?? 0) + 1);
  console.log(`gallery: ${gallery.length} cards (${[...bySet].map(([k, v]) => `${k} ${v}`).join(", ")})`);

  // Loaded here, not at the top: tests/backfill-card-text.test.ts imports the
  // pure helpers above, and importing lib/db would construct a Prisma client.
  // lib/db resolves the operational database through src/lib/db-chains.ts.
  const { prisma } = await import("../src/lib/db");
  try {
    const select = {
      id: true, externalId: true, name: true, collectorNumber: true, description: true,
      // Only for the meta-description preview below.
      setCode: true, setName: true, variant: true, isPromo: true, rarity: true, domain: true, type: true,
    } as const;
    const rows = await prisma.card.findMany({ where: { setCode: { in: sets } }, select });
    const venRows = await prisma.card.findMany({
      where: { setCode: CANARY_SET, description: { not: null } },
      select: { id: true, externalId: true, name: true, collectorNumber: true, description: true },
    });

    const canary = formatCanary(venRows, gallery);
    const plan = planBackfill(rows, gallery.filter((g) => sets.includes(g.setCode)));

    // What the card page's meta description becomes (see card/[id]/page.tsx):
    // the rules text now leads, clamped to 70. Does the price sentence still
    // start inside Google's ~155 characters?
    const PRICE_BIT = "Live prices from A$12.34 across 5 stores, updated daily.";
    const previews = plan.updates.slice(0, 20).map(({ card, text }) => {
      const kind = printingKind(printingFieldsFrom(card));
      const d = cardMetaDescription({
        displayName: cardDisplayName(card.name, card),
        identCode: `${card.setCode} ${card.collectorNumber}`,
        setName: card.setName,
        collectorNumber: card.collectorNumber,
        kind,
        textBit: clampText(text, 70),
        statBit: `${card.domain} ${card.type.toLowerCase()} · ${card.rarity}`,
        priceBit: PRICE_BIT,
      });
      return { d, priceInside: d.indexOf(PRICE_BIT) >= 0 && d.indexOf(PRICE_BIT) < 155 };
    });

    const lines: string[] = [];
    const log = (s = "") => { lines.push(s); console.log(s); };
    log(`## backfill-card-text — ${APPLY ? "APPLY" : "dry run"} (${sets.join(", ")})`);
    log();
    log(`Format canary (${CANARY_SET} rows re-derived from the gallery): **${canary.equal}/${canary.compared}** identical — ${canary.ok ? "✅ format matches" : "❌ FORMAT DIFFERS, refusing to write"}`);
    for (const d of canary.diffs.slice(0, 3)) {
      log(`- \`${d.externalId}\` stored: ${oneLine(d.stored)}`);
      log(`  derived: ${oneLine(d.derived)}`);
    }
    log();
    log("| | rows |");
    log("|---|---:|");
    log(`| catalogue rows in scope | ${rows.length} |`);
    log(`| **matched, will fill** | **${plan.updates.length}** |`);
    log(`| matched, already has text (untouched) | ${plan.alreadyFilled} |`);
    log(`| matched, card prints no text | ${plan.noText} |`);
    log(`| name mismatch (skipped) | ${plan.nameMismatch.length} |`);
    log(`| collector-number mismatch (skipped) | ${plan.collectorMismatch.length} |`);
    log(`| unmatched: no gallery card has this externalId | ${plan.unmatched.length} |`);
    log(`| gallery cards with no catalogue row | ${plan.galleryWithoutRow.length} |`);
    log();
    log("### Samples");
    for (const u of plan.updates.slice(0, 10)) log(`- \`${u.card.externalId}\` ${u.card.name}: ${oneLine(u.text)}`);
    if (plan.nameMismatch.length) {
      log("### Name mismatches");
      for (const m of plan.nameMismatch.slice(0, 15)) log(`- \`${m.card.externalId}\` catalogue "${m.card.name}" vs gallery "${m.gallery.name}"`);
    }
    if (plan.collectorMismatch.length) {
      log("### Collector-number mismatches");
      for (const m of plan.collectorMismatch.slice(0, 15)) log(`- \`${m.card.externalId}\` catalogue ${m.card.collectorNumber} vs gallery ${m.gallery.publicCode}`);
    }
    if (plan.unmatched.length) {
      log("### Unmatched (first 15)");
      for (const u of plan.unmatched.slice(0, 15)) log(`- \`${u.externalId}\` ${u.name} ${u.collectorNumber}`);
    }
    log();
    log(`### Meta description preview: price sentence inside 155 chars on ${previews.filter((p) => p.priceInside).length}/${previews.length}`);
    for (const p of previews.slice(0, 5)) log(`- (${p.d.length}) ${oneLine(p.d, 240)}`);

    let written = 0;
    if (APPLY) {
      if (!canary.ok) {
        log();
        log("❌ Not writing: the canary says the derived text is not in the stored format. Every lib/keywords.ts predicate reads that format.");
        process.exitCode = 1;
      } else {
        // `description: null` in the WHERE, not just in the plan: fill-only even
        // if something wrote the row between the read above and this update.
        for (let i = 0; i < plan.updates.length; i += 50) {
          const chunk = plan.updates.slice(i, i + 50);
          const results = await prisma.$transaction(
            chunk.map((u) => prisma.card.updateMany({ where: { id: u.card.id, description: null }, data: { description: u.text } })),
          );
          written += results.reduce((n, r) => n + r.count, 0);
        }
        log();
        log(`✅ Filled ${written} descriptions.`);
      }
    } else {
      log();
      log("Dry run — nothing written. Re-run with `apply` ticked once the canary passes, matches look right and name mismatches are 0.");
    }

    if (process.env.GITHUB_STEP_SUMMARY) {
      try {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
      } catch {
        /* the log above has everything */
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

// RUN ONLY WHEN INVOKED AS A SCRIPT — the test imports the helpers above (same
// guard and reason as scripts/bing-coverage.ts).
const invokedDirectly = process.argv[1] != null && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
