/**
 * Add printings that exist on TCGplayer but are missing from our RiftScribe-derived
 * catalogue (e.g. the "b" rune printings / shiny/showcase extras). For each TCGplayer
 * single that doesn't match an existing card, we clone its BASE card (same set + base
 * number) and set the variant collector number — exactly like add-promos.ts, so game
 * data is correct and it displays. Prices are filled by the normal importer afterwards.
 *
 * Usage: npx tsx scripts/add-tcg-printings.ts [--dry]
 */
import { PrismaClient } from "@prisma/client";
import { fetchTcgplayerProducts, numKey, setFromTotal, setCodeFromSetName } from "../src/lib/tcgplayer";
import { cardSlug } from "../src/lib/card-url";

const prisma = new PrismaClient();

// numKey / setFromTotal are IMPORTED from lib/tcgplayer, not re-declared here.
// This file used to keep private copies and they drifted: the local setFromTotal
// never learned VEN (166), so every Vendetta variant printing silently fell
// through to "badNum" and was never created.

async function main() {
  const dry = process.argv.includes("--dry");
  console.log("Fetching TCGplayer catalogue…");
  const products = await fetchTcgplayerProducts();
  const cards = await prisma.card.findMany();

  const have = new Set<string>();
  const baseBy = new Map<string, (typeof cards)[number]>();
  // A set-less number ("R04a", "NN1") can only be keyed by the card's OWN setCode.
  // Without this, `have` never knew about existing rune printings, so every run
  // either re-created them or (more often) skipped the whole class silently.
  const baseBySetAndName = new Map<string, (typeof cards)[number]>();
  // Display set name straight from existing rows, so a cloned card's setName matches
  // whatever this DB already uses for that set rather than a hardcoded guess.
  const setNameByCode = new Map<string, string>();
  for (const c of cards) {
    const [num, total] = c.collectorNumber.split("/");
    const sc = setFromTotal(total);
    have.add(`${sc ?? c.setCode}|${numKey(num)}`);
    if (c.setName && !setNameByCode.has(c.setCode)) setNameByCode.set(c.setCode, c.setName);
    if (c.variant == null && !c.isPromo) {
      baseBy.set(`${c.setCode}|${num.replace(/[a-z*]/gi, "")}/${total}`, c);
      const k = `${c.setCode}|${c.name.toLowerCase()}`;
      if (!baseBySetAndName.has(k)) baseBySetAndName.set(k, c);
    }
  }
  const existingExternal = new Set(cards.map((c) => c.externalId).filter(Boolean) as string[]);
  // Track slugs so we don't create a duplicate card when TCGplayer lists the same
  // printing twice (e.g. a normal + foil entry that share name/number → same slug).
  const usedSlugs = new Set(cards.map((c) => c.slug).filter(Boolean) as string[]);
  let dupSkipped = 0;

  // Unique base-card names (variant null, non-promo) so we can place promos whose
  // TCGplayer number doesn't encode a set (e.g. the R-numbered promo runes) by name.
  const nameCounts = new Map<string, number>();
  for (const c of cards) if (c.variant == null && !c.isPromo) nameCounts.set(c.name, (nameCounts.get(c.name) || 0) + 1);
  const baseByName = new Map<string, (typeof cards)[number]>();
  for (const c of cards) if (c.variant == null && !c.isPromo && nameCounts.get(c.name) === 1) baseByName.set(c.name, c);
  // Any base card of a given name, regardless of set — the art/domain/type donor of
  // last resort. Runes are the reason this exists: "Mind Rune" is printed in EVERY
  // set, so it is never name-unique and `baseByName` can never hold it, which is
  // exactly why R-numbered rune printings were being dropped wholesale.
  const anyBaseByName = new Map<string, (typeof cards)[number]>();
  for (const c of cards) if (c.variant == null && !c.isPromo && !anyBaseByName.has(c.name.toLowerCase())) anyBaseByName.set(c.name.toLowerCase(), c);

  let created = 0, noBase = 0, skipExisting = 0, badNum = 0;
  const samples: string[] = [];
  const badDenoms: Record<string, number> = {};
  const badSamples: string[] = [];
  const noteBad = (numStr: string | undefined, name: string) => {
    badNum++;
    const t = numStr && numStr.includes("/") ? numStr.split("/")[1] : "(no slash)";
    badDenoms[t] = (badDenoms[t] || 0) + 1;
    if (badSamples.length < 15) badSamples.push(`${(numStr || "(none)").padEnd(12)} ${name.slice(0, 40)}`);
  };

  // `setCode` overrides the donor's set — needed when the art/game-data donor lives
  // in a DIFFERENT set than the printing being created (a UNL rune cloned from the
  // OGN print of the same rune, because the UNL base rune isn't in our catalogue).
  async function cloneCard(
    base: (typeof cards)[number],
    collectorNumber: string,
    externalId: string,
    variant: string | null,
    isPromo: boolean,
    label: string,
    setCode?: string
  ) {
    const sc = setCode ?? base.setCode;
    // Fresh unique slug — cloning the base's slug would collide (slug is @unique).
    const slug = cardSlug({ name: base.name, setCode: sc, collectorNumber, isPromo });
    if (usedSlugs.has(slug)) { dupSkipped++; return; } // a twin listing already creates this printing
    usedSlugs.add(slug);
    if (samples.length < 25) samples.push(`${label}: ${base.name} ${sc} ${collectorNumber}${isPromo ? " [promo]" : ""}`);
    created++;
    if (!dry) {
      const { id, createdAt, ...rest } = base;
      // Alt-art ("variant") prints are a Showcase-tier treatment — don't let them
      // inherit the base card's rarity (e.g. "Rare") or they pollute that rarity
      // filter with what looks like the base art. Promos keep their base rarity
      // (they carry their own PROMO badge).
      const rarity = variant != null ? "Showcase" : rest.rarity;
      await prisma.card.create({
        data: {
          ...rest, rarity, externalId, collectorNumber, slug, variant, isPromo,
          setCode: sc, setName: setNameByCode.get(sc) ?? rest.setName,
          viewCount: 0, searchCount: 0, lastViewedAt: null, marketPriceCents: 0,
          lowestPriceCents: null, lowestPriceCentsUs: null, lowestPriceCentsUk: null,
          lowestPriceCentsSg: null, lowestPriceCentsCa: null, lowestPriceCentsDe: null,
        },
      }).catch((e) => { console.warn("create failed", collectorNumber, e.message); created--; usedSlugs.delete(slug); });
    }
  }

  const SEALED = /display|booster|bundle|\bbox\b|\bcase\b|\bpack\b|\bdeck\b/i;
  // TCGplayer's own signal that a product is a distinct promotional printing —
  // "(Promo)" or a bare trailing "Promo"/"P" in the name — as opposed to the
  // regular pack-pulled Showcase/alt-art printing of the same numbered card.
  const PROMO_NAME = /\(promo\)|\bpromo\b/i;
  // TCGplayer sells organized-play/event promos (the Nexus Night rune cycle —
  // Fury/Calm/Mind/Body/Chaos/Order — "166b/298" etc.) under their OWN "set" in
  // its taxonomy, even though the number carries a real "/NNN" denominator and
  // so takes path 1 below, not the setless path 2. Path 1 used to hardcode
  // isPromo=false for every in-set variant, so these six were created with the
  // right name/art/number but silently weren't flagged as promos at all — no
  // PROMO badge, no "-promo" slug, invisible to the isPromo=true browse filter.
  const OP_SET_NAME = /organized play/i;
  for (const p of products) {
    const numStr = p.customAttributes?.number;
    const externalId = `tcg-${p.productId}`;
    if (existingExternal.has(externalId)) { skipExisting++; continue; }

    // 1) In-set printing: number parses to a known set (e.g. "007b/298").
    if (numStr && numStr.includes("/")) {
      const [num, total] = numStr.split("/");
      const sc = setFromTotal(total);
      if (sc) {
        const isOpPromo = OP_SET_NAME.test(p.setName ?? "");
        const haveKey = isOpPromo ? `${sc}|${numKey(num)}|promo` : `${sc}|${numKey(num)}`;
        if (have.has(haveKey)) continue; // already have it
        const base = baseBy.get(`${sc}|${num.replace(/[a-z*]/gi, "")}/${total}`);
        if (base) {
          const letter = (num.match(/[a-z]+/i)?.[0] || "").toLowerCase() || null;
          await cloneCard(base, numStr, externalId, letter, isOpPromo, isOpPromo ? "PROMO(org-play)" : "VARIANT");
        } else { noBase++; if (samples.length < 25) samples.push(`NO BASE: ${p.productName} ${numStr}`); }
        continue;
      }
    }

    // 2) Set-less number ("R04a", "R06b", "NN1"…): the number carries no set, and the
    //    name is reused across sets (every set prints all six runes), so NEITHER alone
    //    can place the card. TCGplayer's own setName is the missing third signal — use
    //    it to resolve the set, then find the donor within that set (falling back to
    //    the same card from another set purely for art/domain/type).
    //
    //    This is the fix for the whole missing rune class: SFD R04a, UNL R02b/R04b/
    //    R06a/R06b and friends. They could never match path 1 (no "/NNN") and were
    //    excluded from the old name-based path below, which requires a GLOBALLY UNIQUE
    //    base name — something a rune can never have.
    if (numStr && !SEALED.test(p.productName)) {
      const sc = setCodeFromSetName(p.setName);
      const numSeg = numStr.split("/")[0];
      if (sc && numSeg) {
        // A product explicitly labelled "(Promo)" is a DIFFERENT physical printing
        // from the plain/Showcase card sharing the same number — e.g. a "R06b" pulled
        // from packs vs a separately-numbered "R06b P" given out at an event. Keying
        // it in its OWN namespace (rather than the shared `have` key every other
        // printing of this number uses) stops the second product from being silently
        // treated as "already have it" and dropped — that's exactly the bug: R06b P
        // (and siblings) never got created because R06b's Showcase print claimed the
        // key first.
        const isExplicitPromo = PROMO_NAME.test(p.productName);
        const haveKey = isExplicitPromo ? `${sc}|${numKey(numSeg)}|promo` : `${sc}|${numKey(numSeg)}`;
        if (have.has(haveKey)) continue; // already have it
        // "R04a" → prefix "R", digits "04", suffix "a" (the Showcase variant letter).
        const shape = numSeg.match(/^([a-z]*)(\d+)([a-z]*)$/i);
        const cleanName = p.productName.replace(/\s*\([^)]*\)\s*$/, "").trim();
        const donor =
          baseBySetAndName.get(`${sc}|${cleanName.toLowerCase()}`) ??
          anyBaseByName.get(cleanName.toLowerCase());
        if (donor) {
          // A parseable number is a real in-set printing (variant letter = Showcase
          // treatment); anything else ("NN1", "WB25") is an organized-play promo.
          // An explicit "(Promo)" name always wins regardless of shape, and gets a
          // "P"-suffixed collector number so it can never collide (slug uniqueness)
          // with the non-promo printing of the same base number.
          const letter = !isExplicitPromo && shape ? (shape[3] || "").toLowerCase() || null : null;
          const isPromo = isExplicitPromo || !shape;
          const collectorNumber = isExplicitPromo ? `${numSeg}P` : numSeg;
          await cloneCard(donor, collectorNumber, externalId, letter, isPromo, isExplicitPromo ? "PROMO(named)" : isPromo ? "PROMO" : "SETLESS", sc);
          have.add(haveKey);
          continue;
        }
        noBase++;
        if (samples.length < 25) samples.push(`NO BASE: ${p.productName} ${numStr} (${sc})`);
        continue;
      }
    }

    // 3) Last resort — no usable set signal at all: place by globally unique name.
    if (numStr && !SEALED.test(p.productName) && baseByName.has(p.productName)) {
      await cloneCard(baseByName.get(p.productName)!, numStr, externalId, null, true, "PROMO");
      continue;
    }
    noteBad(numStr, p.productName);
  }
  console.log(`${dry ? "[DRY] " : ""}create=${created} | dupSkipped=${dupSkipped} | noBase=${noBase} | skipExisting=${skipExisting} | badNum=${badNum}`);
  for (const s of samples) console.log("  ", s);
  if (dry) {
    console.log("badNum by denominator:", JSON.stringify(badDenoms));
    console.log("badNum samples:");
    for (const s of badSamples) console.log("  ", s);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
