/**
 * Import Vendetta cards scraped from the OFFICIAL gallery (prisma/vendetta-cards.json,
 * produced by scripts/fetch-vendetta-official.ts) into the Card table. ADDITIVE and
 * idempotent — never wipes, never touches other sets' cards. Safe to re-run through
 * spoiler season; new reveals are added, existing rows refreshed.
 *
 * Accuracy rules:
 *  - name/type/rules come from the gallery's own alt text; domain from the gallery's
 *    domain filters; images are official Riot CDN assets. Nothing is invented.
 *  - rarity is only stored when the gallery exposed it; otherwise "TBC" (honest
 *    placeholder, auto-corrected when RiftScribe catalogues the card — sync-cards
 *    ADOPTS these rows in place, so URLs never change and no duplicates form).
 *  - A card whose NAME already exists in another set is skipped (reprint/filter-bleed
 *    guard) and reported — better to miss a reprint than mislabel a set.
 *  - Rows missing name/image/type/domain are skipped and reported.
 *
 * Usage:  DRY_RUN=1 npx tsx scripts/import-vendetta.ts   # preview
 *         npx tsx scripts/import-vendetta.ts             # apply
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSearch } from "../src/lib/format";

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === "1";

type Scraped = {
  name: string;
  imageUrl: string;
  set?: string;
  cardId?: string; // official gallery id, e.g. "ven-021-166" / "ven-r01"
  number?: string; // id segment, e.g. "021", "021a", "r01"
  code?: string; // official collector code, e.g. "021/166", "R01"
  type?: string;
  domain?: string;
  rarity?: string;
  rules?: string;
  energy?: number | null;
  might?: number | null;
};

const DOMAINS = new Set(["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"]);
const TYPES = new Set(["Unit", "Spell", "Gear", "Rune", "Battlefield", "Legend"]);
const RARITIES = new Set(["Common", "Uncommon", "Rare", "Epic", "Showcase"]);

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function uniqueSlug(base: string, externalId: string): Promise<string> {
  const clash = await prisma.card.findUnique({ where: { slug: base }, select: { externalId: true } });
  if (!clash || clash.externalId === externalId) return base;
  return `${base}-${externalId.replace(/[^a-z0-9]/gi, "").slice(-5)}`;
}

async function main() {
  let rows: Scraped[];
  try {
    rows = JSON.parse(readFileSync(join(process.cwd(), "prisma", "vendetta-cards.json"), "utf8"));
  } catch (e) {
    console.error("Could not read prisma/vendetta-cards.json — run scripts/fetch-vendetta-official.ts first.", (e as Error).message);
    return;
  }

  let created = 0, updated = 0;
  const skipped: string[] = [];
  const nameCount = new Map<string, number>(); // duplicate names in the scrape = alt-art variants

  for (const r of rows) {
    const name = (r.name ?? "").trim();
    const imageUrl = (r.imageUrl ?? "").trim();
    const type = r.type && TYPES.has(titleCase(r.type)) ? titleCase(r.type) : "";
    const domain = r.domain && DOMAINS.has(titleCase(r.domain)) ? titleCase(r.domain) : "";
    const rarity = r.rarity && RARITIES.has(titleCase(r.rarity)) ? titleCase(r.rarity) : "TBC";

    const problems: string[] = [];
    if (!name || /coming soon/i.test(name)) problems.push("name");
    if (!/^https?:\/\//.test(imageUrl)) problems.push("image");
    if (!type) problems.push(`type(${r.type ?? "missing"})`);
    if (!domain) problems.push(`domain(${r.domain ?? "missing"})`);
    if (problems.length) {
      skipped.push(`${name || "(unnamed)"} — ${problems.join(", ")}`);
      continue;
    }

    // Reprint / filter-bleed guard — ONLY for rows without an official gallery id.
    // Cards extracted from __NEXT_DATA__ carry set.value.id === "VEN", so a familiar
    // name there is a genuine Vendetta reprint and gets imported with its VEN number.
    if (!r.cardId) {
      const sameName = await prisma.card.findFirst({
        where: { name, setCode: { not: "VEN" } },
        select: { setCode: true },
      });
      if (sameName) {
        skipped.push(`${name} — exists in ${sameName.setCode} (reprint/bleed guard)`);
        continue;
      }
    }

    // Prefer the OFFICIAL gallery card id for identity (stable, unique per printing,
    // carries the real collector segment + alt-art letter). Fall back to name-based.
    const officialId = (r.cardId ?? "").trim().toLowerCase();
    const numberSeg = (r.number ?? "").trim().toLowerCase();
    let variant: string | null = numberSeg.match(/^\d+([a-z])$/)?.[1] ?? null;
    if (!variant) {
      // No official id → repeated names within the scrape are variant printings.
      const nth = (nameCount.get(name) ?? 0) + 1;
      nameCount.set(name, nth);
      variant = nth > 1 ? String.fromCharCode(95 + nth) : null; // 2nd → "a", 3rd → "b"
    }
    const externalId = officialId
      ? `ven-official-${officialId}`
      : `ven-official-${slugify(name)}${variant ? `-${variant}` : ""}`;
    // Prefer the official collector code ("021/166"); fall back to the id segment.
    const collectorNumber = (r.code ?? "").trim() ? (r.code as string).trim().toUpperCase() : numberSeg ? numberSeg.toUpperCase() : "TBA";

    const data = {
      name,
      nameNormalized: normalizeSearch(name),
      setCode: "VEN",
      setName: "Vendetta",
      collectorNumber,
      domain,
      type,
      rarity,
      variant,
      isPromo: false,
      energyCost: r.energy ?? null,
      might: r.might ?? null,
      description: r.rules && r.rules !== "[NO TEXT]" ? r.rules : null,
      imageUrl,
      imageThumbUrl: imageUrl,
    };

    const existing = await prisma.card.findUnique({ where: { externalId }, select: { id: true, slug: true } });
    if (existing) {
      if (!DRY) await prisma.card.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      const slug = await uniqueSlug(`${slugify(name)}-ven${numberSeg ? `-${slugify(numberSeg)}` : variant ? `-${variant}` : ""}`, externalId);
      console.log(`${DRY ? "(dry) " : ""}NEW  ${name}${variant ? ` (alt ${variant})` : ""} [VEN] ${domain}/${type}/${rarity} -> /card/${slug}`);
      if (!DRY) {
        await prisma.card.create({
          data: { ...data, externalId, slug, marketPriceCents: 0, artSeed: Math.floor(Math.random() * 1_000_000) },
        });
      }
      created++;
    }
  }

  console.log(`\nVendetta import: ${created} created, ${updated} refreshed, ${skipped.length} skipped${DRY ? " (dry run)" : ""}.`);
  if (skipped.length) {
    console.log("Skipped:");
    for (const s of skipped.slice(0, 40)) console.log(`  - ${s}`);
    if (skipped.length > 40) console.log(`  … and ${skipped.length - 40} more`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
