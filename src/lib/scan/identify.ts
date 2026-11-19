// The whole scan, read -> match -> (only for look-alike printings) a visual pick. No "@/" imports: the route and the
// accuracy eval (scripts/scan-eval) run exactly this. DECISIONS.md 2026-11-19 "Card scanner beta".
import type Anthropic from "@anthropic-ai/sdk";
import { matchScan, visualTwins, type ScanCatalogCard, type ScanMatch } from "./match";
import { pickTwin, readCard, scanCostUsd, SCAN_MODEL, type ReadResult } from "./read";

export interface ScanOutcome extends ScanMatch {
  reading: ReadResult["reading"];
  ms: number;
  costUsd: number;
  calls: number;
  twinCheck: "none" | "picked" | "unsure" | "failed";
}

export async function identifyCard(client: Anthropic, imageBase64: string, catalog: ScanCatalogCard[], opts: { model?: string } = {}): Promise<ScanOutcome> {
  const model = opts.model ?? SCAN_MODEL;
  const read = await readCard(client, imageBase64, { model });
  let m = matchScan(read.reading, catalog);
  let ms = read.ms;
  let cost = scanCostUsd(read.usage, model);
  let calls = 1;
  let twinCheck: ScanOutcome["twinCheck"] = "none";
  const twins = m.bestId && m.confidence !== "none" ? visualTwins(m.bestId, catalog) : [];
  if (twins.length) {
    calls++;
    try {
      const t = await pickTwin(client, imageBase64, twins.map((c) => c.imageUrl!), { model });
      ms += t.ms;
      cost += scanCostUsd(t.usage, model);
      if (t.index !== null) {
        const chosen = twins[t.index];
        twinCheck = "picked";
        const others = [m.bestId!, ...m.alternateIds].filter((id) => id !== chosen.id);
        m = { ...m, bestId: chosen.id, alternateIds: others, why: `${m.why}; picture compared with ${twins.length} printings` };
      } else {
        twinCheck = "unsure";
        m = { ...m, confidence: m.confidence === "high" ? "medium" : m.confidence, why: `${m.why}; could not tell the printings apart` };
      }
    } catch {
      twinCheck = "failed";
      m = { ...m, confidence: m.confidence === "high" ? "medium" : m.confidence };
    }
  }
  return { ...m, reading: read.reading, ms, costUsd: cost, calls, twinCheck };
}
