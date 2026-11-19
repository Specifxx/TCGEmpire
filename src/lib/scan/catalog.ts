// The slim card list the scanner matches against: ~1,800 rows x 7 short columns (~350 KB), held in a
// globalThis memo for a day (lib/db.ts egress rule 2), so a scan reads the database for the few result rows only.
import { prisma } from "@/lib/db";
import type { ScanCatalogCard } from "./match";

const TTL_MS = 24 * 60 * 60 * 1000;
type Memo = { at: number; rows: ScanCatalogCard[] } | null;
const slot = globalThis as unknown as { __scanCatalog?: Memo; __scanCatalogLoading?: Promise<ScanCatalogCard[]> };

export async function getScanCatalog(): Promise<ScanCatalogCard[]> {
  const memo = slot.__scanCatalog;
  if (memo && Date.now() - memo.at < TTL_MS) return memo.rows;
  if (!slot.__scanCatalogLoading) {
    slot.__scanCatalogLoading = prisma.card
      .findMany({ select: { id: true, name: true, setCode: true, collectorNumber: true, isPromo: true, variant: true, imageUrl: true, imageThumbUrl: true }, take: 20_000 })
      .then((raw) => {
        // The twin check shows the model the smaller image when there is one (fewer tokens, same picture).
        const rows: ScanCatalogCard[] = raw.map(({ imageThumbUrl, imageUrl, ...c }) => ({ ...c, imageUrl: imageThumbUrl ?? imageUrl }));
        slot.__scanCatalog = { at: Date.now(), rows };
        return rows;
      })
      .finally(() => {
        slot.__scanCatalogLoading = undefined;
      });
  }
  return slot.__scanCatalogLoading;
}
