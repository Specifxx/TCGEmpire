/**
 * Import Vendetta cards scraped from the OFFICIAL gallery (prisma/vendetta-cards.json,
 * produced by scripts/fetch-vendetta-official.ts) into the Card table. ADDITIVE and
 * idempotent — never wipes, never touches other sets' cards. Safe to re-run every few
 * days through spoiler season; new reveals get added, existing rows refreshed.
 *
 * Accuracy rule: rows missing name/image/domain/type/rarity are SKIPPED and reported,
 * never guessed. When RiftScribe later catalogues these cards properly,
 * scripts/sync-cards.ts ADOPTS these rows in place (same set+name), so URLs never
 * change and no duplicates are created.
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
  number?: string;
  rarity?: string;
  type?: string;
  domain?: string;
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
  const seenExternal = new Set<string>();

  for (const r of rows) {
    const name = (r.name ?? "").trim();
    const imageUrl = (r.imageUrl ?? "").trim();
    const domain = r.domain ? titleCase(r.domain.trim()) : "";
    const type = r.type ? titleCase(r.type.trim()) : "";
    const rarity = r.rarity ? titleCase(r.rarity.trim()) : "";

    // Never guess card data: incomplete or unrecognised rows are skipped + reported.
    const problems: string[] = [];
    if (!name) problems.push("name");
    if (!/^https?:\/\//.test(imageUrl)) problems.push("image");
    if (!DOMAINS.has(domain)) problems.push(`domain(${r.domain ?? "missing"})`);
    if (!TYPES.has(type)) problems.push(`type(${r.type ?? "missing"})`);
    if (!RARITIES.has(rarity)) problems.push(`rarity(${r.rarity ?? "missing"})`);
    if (problems.length) {
      skipped.push(`${name || "(unnamed)"} — ${problems.join(", ")}`);
      continue;
    }

    const numRaw = (r.number ?? "").trim();
    const collectorNumber = numRaw ? (numRaw.includes("/") ? numRaw : numRaw) : "TBA";
    const externalId = `ven-official-${slugify(name)}${numRaw ? `-${slugify(numRaw)}` : ""}`;
    if (seenExternal.has(externalId)) continue; // duplicate scrape row
    seenExternal.add(externalId);

    const data = {
      name,
      nameNormalized: normalizeSearch(name),
      setCode: "VEN",
      setName: "Vendetta",
      collectorNumber,
      domain,
      type,
      rarity,
      variant: numRaw.match(/^\d+([a-z]+)/i)?.[1]?.toLowerCase() ?? null,
      isPromo: false,
      energyCost: r.energy ?? null,
      might: r.might ?? null,
      imageUrl,
      imageThumbUrl: imageUrl,
    };

    const existing = await prisma.card.findUnique({ where: { externalId }, select: { id: true, slug: true } });
    if (existing) {
      if (!DRY) await prisma.card.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      // Slug WITHOUT a guessed collector number (numbers may be unknown pre-release;
      // slugs are permanent, so we never bake in a number we aren't given).
      const slug = await uniqueSlug(numRaw ? `${slugify(name)}-ven-${slugify(numRaw.split("/")[0])}` : `${slugify(name)}-ven`, externalId);
      console.log(`${DRY ? "(dry) " : ""}NEW  ${name} [VEN ${collectorNumber}] ${domain}/${type}/${rarity} -> /card/${slug}`);
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
    console.log("Skipped (incomplete data — never guessed):");
    for (const s of skipped.slice(0, 30)) console.log(`  - ${s}`);
    if (skipped.length > 30) console.log(`  … and ${skipped.length - 30} more`);
    console.log("If many rows are skipped, re-run the fetch with DUMP=1 and share scratch/vendetta-dump.json.");
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
