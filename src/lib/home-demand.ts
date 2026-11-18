// The per-item demand the home page ranks by (lib/home-rank.ts): data/demand.json, refreshed once a day by
// refresh-prices.yml (scripts/pull-demand.sh, from /api/demand/rc) and bundled with the release. Imported, so a page reads
// no file and no database for it.
import raw from "../../data/demand.json";
import type { DemandFile } from "./home-rank";

// Through `unknown`: the JSON import types each day's file literally, and a day with no clicks yet ({}) no longer overlaps DemandFile.
export const HOME_DEMAND = raw as unknown as DemandFile;
