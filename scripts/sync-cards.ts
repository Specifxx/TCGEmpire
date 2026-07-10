/**
 * PROD-SAFE additive card sync. Reads the committed RiftScribe snapshot
 * (prisma/riftbound-cards.json) and UPSERTS every card into the DB — creating the
 * ones prod is missing and refreshing existing ones — WITHOUT wiping anything (unlike
 * prisma/seed.ts, which resets the whole DB and is dev-only). This is what to run when
 * the snapshot has cards prod doesn't (e.g. after `scripts/fetch-cards.ts` pulls new
 * reveals). Idempotent; existing slugs, art seeds and reference prices are preserved so
 * public URLs and prices never churn.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/sync-cards.ts   # list what WOULD change, no writes
 *   npx tsx scripts/sync-cards.ts             # apply
 *
 * The card MAPPING below is kept identical to prisma/seed.ts so slugs/numbers match.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { titleCase } from "../src/lib/constants";
import { normalizeSearch } from "../src/lib/format";
import { cardSlug } from "../src/lib/card-url";

const prisma = new PrismaClient();
const DRY = process.env.DRY_RUN === "1";

interface RsCard {
  id: string;
  name: string;
  set_id: string;
  collector_number: number;
  rarity: string;
  faction: string;
  type: string;
  orientation: string;
  stats: { energy: number | null; might: number | null; power: number | null };
  image: string;
  image_thumb: { small: string; medium: string; large: string };
  image_blur_data_url: string;
}

const SET_NAMES: Record<string, string> = {
  OGN: "Origins", OGS: "Origins: Proving Grounds", SFD: "Spirit Forged", UNL: "Unleashed", VEN: "Vendetta",
};
const CHAMP_OVERRIDES: Record<string, string> = {
  kaisa: "Kai'Sa", velkoz: "Vel'Koz", chogath: "Cho'Gath", khazix: "Kha'Zix",
  reksai: "Rek'Sai", belveth: "Bel'Veth", ksante: "K'Sante", leblanc: "LeBlanc",
  drmundo: "Dr. Mundo", "nunu-willump": "Nunu & Willump", "jarvan-iv": "Jarvan IV",
};
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function titleCaseChamp(slug: string): string {
  if (CHAMP_OVERRIDES[slug]) return CHAMP_OVERRIDES[slug];
  const flat = slug.replace(/-/g, "");
  if (CHAMP_OVERRIDES[flat]) return CHAMP_OVERRIDES[flat];
  return slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}
function enrichLegendName(nameSlug: string | undefined, epithet: string): string {
  if (!nameSlug) return epithet;
  const epiSlug = slugify(epithet);
  let champSlug = nameSlug.endsWith("-" + epiSlug) ? nameSlug.slice(0, nameSlug.length - epiSlug.length - 1) : nameSlug.split("-")[0];
  if (!champSlug || champSlug === nameSlug) return epithet;
  const champ = titleCaseChamp(champSlug);
  if (epithet.toLowerCase().startsWith(champ.toLowerCase())) return epithet;
  return `${champ}, ${epithet}`;
}
// Synthesised reference price by rarity/type (RiftScribe has none) — only for NEW cards.
const RARITY_PRICE_CENTS: Record<string, [number, number]> = {
  Common: [20, 120], Uncommon: [60, 320], Rare: [180, 1100], Epic: [700, 4200], Showcase: [2200, 16000],
};
const TYPE_MULT: Record<string, number> = { Legend: 2.2, Battlefield: 1.3 };
function referencePrice(rarity: string, type: string): number {
  const [lo, hi] = RARITY_PRICE_CENTS[rarity] ?? RARITY_PRICE_CENTS.Common;
  return Math.max(20, Math.round((lo + Math.random() * (hi - lo)) * (TYPE_MULT[type] ?? 1)));
}

function mapCard(c: RsCard, nameMap: Record<string, string>) {
  const parts = c.id.split("-");
  const isStar = parts[2] === "star";
  const numSeg = parts[1] ?? String(c.collector_number);
  const total = (isStar ? parts[3] : parts[2]) ?? "000";
  const collectorNumber = isStar ? `${numSeg}*/${total}` : `${numSeg}/${total}`;
  const variant = numSeg.match(/^\d+([a-z]+)$/i)?.[1]?.toLowerCase() ?? null;
  const domain = c.faction === "colorless" ? "Colorless" : titleCase(c.faction);
  const rarity = titleCase(c.rarity);
  const nameKey = `${parts[0]}-${numSeg}`;
  const name = c.type === "Legend" ? enrichLegendName(nameMap[nameKey], c.name) : c.name;
  return {
    externalId: c.id,
    name,
    nameNormalized: normalizeSearch(name),
    setCode: c.set_id,
    setName: SET_NAMES[c.set_id] ?? c.set_id,
    collectorNumber,
    variant,
    domain,
    type: c.type,
    rarity,
    orientation: c.orientation ?? null,
    energyCost: c.stats?.energy ?? null,
    might: c.stats?.might ?? null,
    power: c.stats?.power ?? null,
    imageUrl: c.image ?? null,
    imageThumbUrl: c.image_thumb?.large ?? c.image_thumb?.medium ?? null,
    blurDataUrl: c.image_blur_data_url ?? null,
  };
}

async function uniqueSlug(base: string, externalId: string): Promise<string> {
  const clash = await prisma.card.findUnique({ where: { slug: base }, select: { externalId: true } });
  if (!clash || clash.externalId === externalId) return base;
  return `${base}-${externalId.replace(/[^a-z0-9]/gi, "").slice(-4)}`;
}

async function main() {
  const rsCards = JSON.parse(readFileSync(join(process.cwd(), "prisma", "riftbound-cards.json"), "utf8")) as RsCard[];
  let nameMap: Record<string, string> = {};
  try {
    nameMap = JSON.parse(readFileSync(join(process.cwd(), "prisma", "card-names.json"), "utf8"));
  } catch {
    console.warn("card-names.json not found — legend names won't get the champion prefix.");
  }
  console.log(`Syncing ${rsCards.length} cards from the snapshot${DRY ? " (dry run)" : ""}…`);

  let created = 0, updated = 0, adopted = 0;
  for (const c of rsCards) {
    const data = mapCard(c, nameMap);
    let existing = await prisma.card.findUnique({ where: { externalId: c.id }, select: { id: true, slug: true } });
    // ADOPTION: pre-release cards imported from the official gallery / manual backstop
    // (externalId "ven-official-*" / "manual-*") are the SAME card under a provisional
    // id. When RiftScribe catalogues it properly, update that row in place — keeping
    // its (permanent, possibly-indexed) slug — instead of creating a duplicate page.
    if (!existing) {
      const candidates = await prisma.card.findMany({
        where: {
          setCode: data.setCode,
          nameNormalized: data.nameNormalized,
          isPromo: false,
          OR: [{ externalId: { startsWith: "ven-official-" } }, { externalId: { startsWith: "manual-" } }],
        },
        select: { id: true, slug: true, variant: true },
      });
      const match = candidates.find((x) => (x.variant ?? null) === (data.variant ?? null)) ?? candidates[0];
      if (match) {
        console.log(`${DRY ? "(dry) " : ""}ADOPT ${data.name} [${data.setCode} ${data.collectorNumber}] -> existing /card/${match.slug}`);
        if (!DRY) await prisma.card.update({ where: { id: match.id }, data: { ...data, externalId: c.id } });
        adopted++;
        continue;
      }
    }
    if (existing) {
      if (!DRY) await prisma.card.update({ where: { id: existing.id }, data: { ...data, slug: existing.slug ?? (await uniqueSlug(cardSlug(data), c.id)) } });
      updated++;
    } else {
      const slug = await uniqueSlug(cardSlug(data), c.id);
      console.log(`${DRY ? "(dry) " : ""}NEW  ${data.name} [${data.setCode} ${data.collectorNumber}] -> /card/${slug}`);
      if (!DRY) {
        await prisma.card.create({
          data: { ...data, slug, marketPriceCents: referencePrice(data.rarity, data.type), artSeed: Math.floor(Math.random() * 1_000_000) },
        });
      }
      created++;
    }
  }
  console.log(`\nCard sync: ${created} created, ${updated} refreshed, ${adopted} adopted (pre-release rows upgraded in place)${DRY ? " (dry run — no writes)" : ""}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
