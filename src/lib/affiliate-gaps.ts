// Pure rules for the weekly affiliate gap audit (scripts/affiliate-gap-audit.ts).
//
// 2026-11-08 (owner: "make sure all of our websites are making money … let me know if there are
// any gaps, because I can't always be finding them"). Every Compare site's outbound links are
// read from outside once a week and sorted into: tracked (eBay EPN, Amazon tag, TCGplayer on
// Impact, Awin, another network), BROKEN (an eBay/Amazon/TCGplayer link without our tag, or a
// store we joined on Awin linked without its Awin deep link: money we are owed and lose), and
// untracked store links. An untracked store whose programme we know is a "programme gap": the
// next application to make.

export const EPN_CAMPAIGN = "5339155912";

/** Our own sites: links between them are not store links. */
export const FAMILY_HOSTS = [
  "riftcompare.com", "opcompare.app", "mtgcompare.app", "dexcompare.app", "gundamcompare.com",
  "lorcanacompare.com", "ygocompare.com", "cyberpunkcompare.com", "bandaicompare.com",
  "camcompare.app", "compareempire.com", "wargamecompare.com", "figurecompare.com", "kaeyoung.com",
  "scentcompare.app", "sportscardcompare.com", "motorcompare.app", "billyang.site",
];

/** Links that are never a shop: social, docs, licences, review sites we cite. */
const NOT_A_SHOP = /(^|\.)(facebook|instagram|twitter|x|tiktok|reddit|youtube|youtu|github|google|googleapis|gstatic|vercel|threads|discord|discord|bsky|whatsapp|pinterest|linkedin|wikipedia|wikimedia|creativecommons|apple\.news|t\.me|telegram|patreon|ko-fi|mailchimp|cloudflare|schema|w3)\.|^(x\.com|t\.me|discord\.gg|bsky\.app)$|(dpreview|cameralabs|imaging-resource|amateurphotographer|digitalcameraworld|petapixel)\.com$/i;

/**
 * Stores with an affiliate programme we know of, by host suffix → where to apply. A link to one
 * of these that is not tracked is a programme gap. Sources: the programme pages in
 * affiliate-approvals/tracker.md (2026-11-03..08). Keep it to programmes a site can join.
 */
export const KNOWN_PROGRAMMES: Array<[RegExp, string]> = [
  // Commission Factory (Australia): one account, then each brand.
  [/(^|\.)(thegoodguys|jbhifi|digidirect|camerahouse|bigw|kogan|catch|myer|davidjones|harveynorman|officeworks|ry|nourishedlife|adorebeauty|chemistwarehouse|appliancesonline|binglee|supercheapauto|repco|sephora)\.com\.au$/i, "Commission Factory"],
  [/(^|\.)teds\.com\.au$|(^|\.)focuscamera\.com$|(^|\.)beachcamera\.com$|(^|\.)fragrancenet\.com$/i, "FlexOffers"],
  [/(^|\.)(fragrancex|perfumania|sobelia|ulta|abt|officedepot)\.com$|(^|\.)notino\./i, "CJ"],
  [/(^|\.)(bestbuy|walmart|target|homedepot|lowes|newegg|adorama|staples|gamestop|samsclub|crutchfield)\.com$|(^|\.)wexphotovideo\.com$/i, "Impact"],
  [/(^|\.)bhphotovideo\.com$/i, "B&H's own programme"],
  [/(^|\.)mpb\.com$|(^|\.)jessops\.com$/i, "Partnerize"],
  [/(^|\.)miniaturemarket\.com$/i, "LinkConnector"],
  [/(^|\.)(yesstyle|stylevana|iherb|keh|lookfantastic|cultbeauty|allbeauty|escentual|perfumeclick|skincupid|misshaus|cliftoncameras|parfumdreams|very|hughes|scan|box|laptopsdirect|hamleys|thetoyshop|robertdyas|appliancedirect|superdrug|beautybay|ryman)\.(com|co\.uk|de)$/i, "Awin"],
  [/(^|\.)samsung\.com$/i, "Samsung (Partnerize/Rakuten by country)"],
  [/(^|\.)zatu\.com$|(^|\.)zatugames\.co\.uk$/i, "Zatu's own programme"],
  [/(^|\.)topps\.com$/i, "Topps (Impact)"],
  [/(^|\.)waylandgames\.co\.uk$/i, "Wayland's own programme"],
  [/(^|\.)hlj\.com$/i, "HobbyLink Japan's own programme"],
];

export type LinkKind =
  | "ebay" | "ebay-untagged" | "amazon" | "amazon-untagged" | "tcgplayer" | "tcgplayer-untagged"
  | "awin" | "network" | "store" | "family" | "ignore";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** What an outbound URL is, after any /go redirect has been followed. */
export function classifyLink(url: string): LinkKind {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "ignore";
  }
  if (!/^https?:$/.test(u.protocol)) return "ignore";
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  const q = u.search + u.hash;
  if (/(^|\.)ebay\.[a-z.]+$/.test(h) || h === "ebay.us") {
    return new RegExp(`campid=${EPN_CAMPAIGN}`).test(q) ? "ebay" : "ebay-untagged";
  }
  if (/(^|\.)amazon\.[a-z.]+$/.test(h) || h === "amzn.to") return /[?&]tag=[^&]+/.test(q) || h === "amzn.to" ? "amazon" : "amazon-untagged";
  if (/(^|\.)partner\.tcgplayer\.com$/.test(h) || /\.(pxf|sjv)\.io$/.test(h)) return "tcgplayer";
  if (/(^|\.)tcgplayer\.com$/.test(h)) return "tcgplayer-untagged";
  if (/(^|\.)awin1\.com$/.test(h)) return "awin";
  // Our own Impact brands (src/lib/awin.ts: accounts 7385758 and 8139279), on whatever vanity host the brand uses.
  if (/^\/c\/(7385758|8139279)\/\d+\/\d+\/?$/.test(u.pathname)) return "network";
  if (/(^|\.)(t\.cfjump\.com|anrdoezrs\.net|dpbolvw\.net|jdoqocy\.com|kqzyfj\.com|tkqlhce\.com|click\.linksynergy\.com|prf\.hn|track\.flexlinkspro\.com|7eer\.net|ojrq\.net|evyy\.net|linkconnector\.com|goaffpro\.com)$/.test(h)) return "network";
  if (FAMILY_HOSTS.some((f) => h === f || h.endsWith(`.${f}`))) return "family";
  if (NOT_A_SHOP.test(h) || /^(mailto|tel):/.test(url)) return "ignore";
  return "store";
}

export function knownProgramme(host: string): string | null {
  for (const [re, network] of KNOWN_PROGRAMMES) if (re.test(host)) return network;
  return null;
}

/** Is this host one we joined on Awin (data/awin/programmes.json on compareempiretake2)? */
export function awinJoined(host: string, joinedDomains: string[]): boolean {
  return joinedDomains.some((d) => host === d || host.endsWith(`.${d}`));
}

export interface SiteTally {
  site: string;
  pages: number;
  tracked: Record<"ebay" | "amazon" | "tcgplayer" | "awin" | "network", number>;
  broken: Array<{ kind: string; url: string }>;
  storeLinks: number;
  storeHosts: Record<string, number>;
  programmeGaps: Record<string, { network: string; links: number }>;
  error?: string;
}

export function emptyTally(site: string): SiteTally {
  return { site, pages: 0, tracked: { ebay: 0, amazon: 0, tcgplayer: 0, awin: 0, network: 0 }, broken: [], storeLinks: 0, storeHosts: {}, programmeGaps: {} };
}

/** Adds one outbound link (already resolved past /go) to a site's tally. */
export function addLink(t: SiteTally, url: string, joinedAwin: string[]): void {
  const kind = classifyLink(url);
  switch (kind) {
    case "ebay": case "amazon": case "tcgplayer": case "awin": case "network":
      t.tracked[kind]++;
      return;
    case "ebay-untagged": case "amazon-untagged": case "tcgplayer-untagged":
      if (t.broken.length < 20) t.broken.push({ kind, url: url.slice(0, 200) });
      return;
    case "store": {
      const h = hostOf(url);
      if (awinJoined(h, joinedAwin)) {
        if (t.broken.length < 20) t.broken.push({ kind: "awin-joined-untracked", url: url.slice(0, 200) });
        return;
      }
      t.storeLinks++;
      t.storeHosts[h] = (t.storeHosts[h] ?? 0) + 1;
      const network = knownProgramme(h);
      if (network) {
        const g = (t.programmeGaps[h] ??= { network, links: 0 });
        g.links++;
      }
      return;
    }
    default:
      return;
  }
}

/** Share of money links (tracked ÷ tracked + untracked store links), 0–100. */
export function trackedShare(t: SiteTally): number {
  const tracked = Object.values(t.tracked).reduce((a, b) => a + b, 0);
  const all = tracked + t.storeLinks + t.broken.length;
  return all ? Math.round((tracked / all) * 100) : 0;
}
