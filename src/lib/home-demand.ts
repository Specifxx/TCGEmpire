// The per-item demand the home page ranks by (lib/home-rank.ts): data/demand.json, refreshed once a day by
// refresh-prices.yml (scripts/pull-demand.sh, from /api/demand/rc) and bundled with the release. Imported, so a page reads
// no file and no database for it.
import raw from "../../data/demand.json";
import type { DemandFile } from "./home-rank";

export const HOME_DEMAND = raw as DemandFile;
