// EMPIRE HQ: every site of the family in one list (owner, 2026-11-02, the
// control tower: "one Monday email", one page with a row per site). DECISIONS.md,
// "Empire HQ and the one Monday report".
//
// Each site is joined to the three things HQ reads about it:
//   host     its Search Console property (Google clicks, growth:gsc snapshot)
//   tags     its affiliate-tag prefixes (eBay customid, TCGplayer sharedid)
//   health   either its own monitor's status file on the repo's public
//            `ops-status` branch, or, for a site without a monitor yet, a probe of
//            its home page and its import workflows' latest runs (read from
//            GitHub Actions by RiftCompare's ops monitor, which then mails on red).
//
// PURE data. Adding a site: one row here, a tag prefix in earnings/sites.ts SITES,
// and either a monitor that publishes ops-status (see GundamCompare's
// ops-monitor.yml) or `jobs` to watch.

export interface HqJob {
  /** Workflow file in the site's repo. */
  file: string;
  label: string;
  /** The newest run older than this is late (warn), twice this is stopped (crit). */
  maxAgeH: number;
}

export interface HqSite {
  key: string;
  label: string;
  url: string;
  /** Search Console host, normalised (no scheme, no www). */
  host: string;
  /** GitHub repo under Specifxx. */
  repo: string;
  /** Affiliate-tag prefixes whose earnings belong to this site. */
  tags: string[];
  /** Its own monitor publishes ops-status/status.json; null for RiftCompare (HQ reads its report directly) and sites without one. */
  monitor: { workflow: string; everyH: number } | null;
  /** For a site without a monitor: the workflows that keep its prices fresh. */
  jobs?: HqJob[];
  /** RiftCompare holds the target "hold"; everyone else is a sister (+15%/week). */
  rift?: boolean;
}

export const OWNER_REPO = "Specifxx";

export const HQ_SITES: HqSite[] = [
  { key: "rc", label: "RiftCompare", url: "https://riftcompare.com", host: "riftcompare.com", repo: "TCGEmpire", tags: ["rc", "pkmn"], monitor: null, rift: true },
  { key: "oc", label: "OP Compare", url: "https://opcompare.app", host: "opcompare.app", repo: "OpCompare", tags: ["oc"], monitor: { workflow: "watchdog.yml", everyH: 8 } },
  {
    key: "dex",
    label: "DexCompare",
    url: "https://dexcompare.app",
    host: "dexcompare.app",
    repo: "CompareEmpire",
    tags: ["dex"],
    monitor: null,
    jobs: [
      { file: "dexcompare-sealed-import.yml", label: "Sealed price import", maxAgeH: 18 },
      { file: "dexcompare-ebay-import.yml", label: "eBay import", maxAgeH: 30 },
    ],
  },
  {
    key: "mtg",
    label: "MTG Compare",
    url: "https://mtgcompare.app",
    host: "mtgcompare.app",
    repo: "mtgcompare",
    tags: ["mtg"],
    monitor: null,
    jobs: [
      { file: "sealed-import.yml", label: "Sealed price import", maxAgeH: 18 },
      { file: "ebay-import.yml", label: "eBay import", maxAgeH: 30 },
    ],
  },
  { key: "gundam", label: "Gundam Compare", url: "https://gundamcompare.com", host: "gundamcompare.com", repo: "GundamCompare", tags: ["gundam"], monitor: { workflow: "ops-monitor.yml", everyH: 3 } },
  { key: "lorcana", label: "Lorcana Compare", url: "https://lorcanacompare.com", host: "lorcanacompare.com", repo: "lorcanacompare", tags: ["lorcana"], monitor: { workflow: "ops-monitor.yml", everyH: 3 } },
  { key: "ygo", label: "YGO Compare", url: "https://ygocompare.com", host: "ygocompare.com", repo: "ygocompare", tags: ["ygo"], monitor: { workflow: "ops-monitor.yml", everyH: 3 } },
  { key: "cyberpunk", label: "Cyberpunk Compare", url: "https://cyberpunkcompare.com", host: "cyberpunkcompare.com", repo: "cyberpunkcompare", tags: ["cyberpunk"], monitor: { workflow: "ops-monitor.yml", everyH: 3 } },
  { key: "wgc", label: "WargameCompare", url: "https://wargamecompare.com", host: "wargamecompare.com", repo: "wargamecompare", tags: ["wgc"], monitor: { workflow: "ops-monitor.yml", everyH: 6 } },
  { key: "figure", label: "FigureCompare", url: "https://figurecompare.com", host: "figurecompare.com", repo: "figurecompare", tags: ["figure"], monitor: { workflow: "ops-monitor.yml", everyH: 3 } },
  { key: "ky", label: "KaeYoung", url: "https://kaeyoung.com", host: "kaeyoung.com", repo: "kaeyoung", tags: ["ky"], monitor: { workflow: "ops-monitor.yml", everyH: 3 } },
  {
    key: "cc",
    label: "CamCompare",
    url: "https://www.camcompare.app",
    host: "camcompare.app",
    repo: "Camcompare",
    tags: ["cc"],
    monitor: null,
    jobs: [{ file: "refresh-prices.yml", label: "Price refresh", maxAgeH: 12 }],
  },
  // A private repository: Actions runs cannot be read with RiftCompare's token, so only its home page is probed.
  { key: "ce", label: "Compare Empire", url: "https://compareempire.com", host: "compareempire.com", repo: "compareempiretake2", tags: ["ce"], monitor: null, jobs: [] },
];

/** Search Console property → the host HQ_SITES uses: "https://www.x.com/" and "sc-domain:x.com" are both "x.com". */
export const normaliseHost = (prop: string): string =>
  prop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^sc-domain:/, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

/** Which site a tag prefix (tagGroup key) belongs to, or null. */
export function siteForTag(prefix: string): HqSite | null {
  return HQ_SITES.find((s) => s.tags.includes(prefix)) ?? null;
}

export const statusUrl = (s: HqSite) => `https://raw.githubusercontent.com/${OWNER_REPO}/${s.repo}/ops-status/status.json`;
export const actionsUrl = (s: HqSite, workflow: string) => `https://github.com/${OWNER_REPO}/${s.repo}/actions/workflows/${workflow}`;
