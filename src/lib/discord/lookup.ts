// Card lookups for the Discord price bot. Discord gives an interaction three
// seconds, so every lookup races a deadline and a slow or failed one becomes
// "no hits" (the reply then offers search links instead of an error).
//
// Riftbound reads RiftCompare's own catalogue through getBulkCardSummary, which
// caches itself for two days (never wrap it: CLAUDE.md, nested caches). The other
// games call their site's public /api/search, which those sites already serve
// from cached data; the bot adds no database read anywhere.
import { COUNTRIES, type Country } from "../country";
import { formatMoney, normalizeSearch } from "../format";
import type { BotGame } from "./games";

export interface BotHit {
  name: string;
  detail: string;
  /** Formatted price with its meaning, or null when the site has none. */
  price: string | null;
  /** Path on the game's site. */
  path: string;
  image: string | null;
}

export const LOOKUP_DEADLINE_MS = 2_200;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface LookupDeps {
  fetch: Fetch;
  riftbound: (market: Country) => Promise<RiftboundEntry[] | null>;
}

export interface RiftboundEntry {
  slug: string | null;
  name: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  priceCents: number;
}

function withDeadline<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

/** Rank catalogue entries for a query: every word must match; name-prefix first, then price. */
export function rankRiftbound(entries: RiftboundEntry[], query: string, market: Country, limit = 3): BotHit[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const nq = words.join(" ");
  const scored = entries
    .map((e) => {
      const hay = normalizeSearch(`${e.name} ${e.setName} ${e.collectorNumber} ${e.rarity}`);
      if (!words.every((w) => hay.includes(w))) return null;
      const name = normalizeSearch(e.name);
      const s = (name === nq ? 3 : name.startsWith(nq) ? 2 : 0) + Math.log10(1 + e.priceCents) / 10;
      return { e, s };
    })
    .filter((x): x is { e: RiftboundEntry; s: number } => !!x && !!x.e.slug)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  const cur = COUNTRIES[market].currency;
  return scored.map(({ e }) => ({
    name: e.name,
    detail: [e.setName, e.collectorNumber, e.rarity].filter(Boolean).join(" · "),
    price: e.priceCents > 0 ? `Cheapest in stock: ${formatMoney(e.priceCents, cur)}` : null,
    path: `/card/${e.slug}`,
    image: null,
  }));
}

interface OpHit {
  kind: "card" | "sealed";
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  set: string;
  img: string | null;
  price: string;
  priceKind?: string;
}

interface EngineHit {
  slug: string;
  name: string;
  set: string;
  image?: string | null;
  price: string;
  number?: string | null;
  rarity?: string | null;
}

const absImage = (s: string | null | undefined) => (s && /^https:\/\//.test(s) ? s : null);

export async function lookupCards(game: BotGame, query: string, market: Country, deps: LookupDeps): Promise<BotHit[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const run = async (): Promise<BotHit[]> => {
    if (game.search === "riftbound") {
      const all = await deps.riftbound(market);
      return all ? rankRiftbound(all, q, market) : [];
    }
    if (game.search === "opcompare") {
      const r = await deps.fetch(`${game.site}/api/search?q=${encodeURIComponent(q)}`, { headers: { Cookie: `country=${market}` } });
      if (!r.ok) return [];
      const j = (await r.json()) as { hits?: OpHit[] };
      return (j.hits ?? []).slice(0, 3).map((h) => ({
        name: h.name,
        detail: [h.set, h.number, h.variant].filter(Boolean).join(" · "),
        price: h.price && h.price !== "—" ? `${h.priceKind === "reference" ? "TCGplayer market" : "Cheapest in stock"}: ${h.price.replace(/^≈\s*/, "")}` : null,
        path: h.kind === "sealed" ? `/sealed/${h.slug}` : `/card/${h.slug}`,
        image: absImage(h.img),
      }));
    }
    if (game.search === "engine") {
      const r = await deps.fetch(`${game.site}/api/search?q=${encodeURIComponent(q)}&limit=3`);
      if (!r.ok) return [];
      const j = (await r.json()) as { hits?: EngineHit[] };
      return (j.hits ?? []).slice(0, 3).map((h) => ({
        name: h.name,
        detail: [h.set, h.number, h.rarity].filter(Boolean).join(" · "),
        price: h.price && h.price !== "—" ? `TCGplayer market: ${h.price}` : null,
        path: `/card/${h.slug}`,
        image: absImage(h.image),
      }));
    }
    return [];
  };
  return withDeadline(run(), LOOKUP_DEADLINE_MS, []);
}
