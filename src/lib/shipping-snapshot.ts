// The checked-in postage snapshot (src/lib/shipping-rates.json): its types, and
// the pure step that condenses one store's raw probe output into it.
//
// WHY A SNAPSHOT: an Adelaide customer ran Best Basket, was shown $2 postage
// for a store and was quoted $20 at its checkout (2026-09-25). Every postage
// figure until then was a hand-typed guess in retailers.ts. The probe
// (scripts/probe-shipping-rates.ts) asks each store's own Shopify checkout what
// it charges for carts of several sizes at several addresses; this file turns
// that ~6 MB of raw output into a few tens of KB the site can import:
//
//   * the measured carts (subtotal, item count) — one list per store;
//   * per group of addresses that were quoted IDENTICALLY (a "zone"), for each
//     cart: the cheapest rate that is not an untracked letter ("std") and the
//     cheapest untracked/letter rate ("ltr"), each with the store's own name;
//   * which carts the store quoted nothing for there (a minimum order, or no
//     delivery to that address at all).
//
// What a cart of any other size costs is worked out at request time by
// lib/shipping.ts from those points, conservatively (see its header). Pickup,
// click & collect and local delivery are never in the snapshot — they are not
// postage. One currency per store, the one the store's carts were priced in;
// a rate in any other currency is dropped, never converted.
//
// Rebuild with `npx tsx scripts/build-shipping-rates.ts <probe output files>`;
// never hand-edit the JSON. Facts that the storefront endpoint cannot show
// (a checkout-only discount, a hand-checked minimum order, a pickup-only
// store) live in SHIPPING_OVERRIDES below, with the evidence for each.

import type { Country } from "./country";
import { classifyRate, type ProbeAddress, type ProbeScenarioResult } from "./shipping-probe";

/** [subtotalCents, items] — a cart the probe really built and read back. */
export type SnapshotCart = [number, number];
/** [cents, index into `names`, 1 = the name says tracked / 0 = it does not say]. */
export type StdEntry = [number, number, 0 | 1];
/** [cents, index into `names`] — an untracked letter / buyer's-risk option. */
export type LtrEntry = [number, number];

export interface SnapshotZone {
  at: string[]; // probe address ids quoted identically (PROBE_ADDRESSES[market][].id)
  std: (StdEntry | null)[]; // aligned with `carts`; null = no such rate quoted for that cart here
  ltr?: (LtrEntry | null)[]; // omitted when no untracked option was ever quoted here
  empty?: number[]; // cart indices the store quoted NO postage for at all here
  err?: number[]; // cart indices whose quote failed here (not measured, not "no postage")
  none?: true; // every measured cart came back empty: the store does not post here
}

export type SnapshotStatus = "measured" | "no-post" | "unmeasured";

export interface SnapshotStore {
  market: Country;
  currency: string;
  measuredAt: string; // YYYY-MM-DD
  status: SnapshotStatus;
  note?: string; // the reason behind a no-post / unmeasured status, or a caveat
  carts: SnapshotCart[];
  names: string[];
  zones: SnapshotZone[];
  minOrderCents?: number; // no postage quoted below this subtotal
  freeFromCents?: number; // free postage the rates endpoint cannot see (a checkout discount)
  freeNote?: string;
  shipsFrom?: string; // the country it posts from, when that is not the market's (import charges may apply)
}

export interface ShippingSnapshot {
  version: 1;
  note: string;
  markets: Partial<Record<Country, { measuredAt: string; addresses: { id: string; label: string }[] }>>;
  stores: Record<string, SnapshotStore>;
}

/** The slice of a probe run's per-store output this needs (see StoreOutput in the script). */
export interface ProbeStoreInput {
  key: string;
  market: Country;
  currency: string;
  measuredAt: string;
  addresses: ProbeAddress[];
  scenarios: ProbeScenarioResult[];
  error?: string;
}

export interface ShippingOverride {
  status?: Exclude<SnapshotStatus, "measured">;
  note?: string;
  minOrderCents?: number;
  freeFromCents?: number;
  freeNote?: string;
  shipsFrom?: string;
}

// Facts the probe cannot read from /cart/shipping_rates.json, each checked by
// hand on 2026-09-25 and recorded in the probe runs' notes. A rebuild keeps them.
export const SHIPPING_OVERRIDES: Record<string, ShippingOverride> = {
  // ── Stores that do not post (at all, or to this market) ──
  larrysgamestore: { status: "no-post", note: "In-store pickup only: its shipping policy says it is not shipping any orders" },
  evolutiontcg: { status: "no-post", note: "Collection from the store only (its site banner); no postage quoted to any UK address" },
  tcgclubhouse: { status: "no-post", note: "Offered no delivery at all when measured (the store is away 15 Sep – 1 Oct 2026)" },
  cgrealm: { status: "no-post", note: "A Windsor, Ontario store (CAD): quoted no postage to any US address" },
  chonkycollectibles: { status: "no-post", note: "A Toronto store whose shipping policy ships to Canada only" },
  espercards: {
    status: "no-post",
    note: "Quoted no postage to any Canadian address we tried and publishes no shipping policy (pickup only, or rates only inside checkout)",
  },
  // ── Stores whose rates exist only inside checkout ──
  punkouter: { status: "unmeasured", note: "Shows postage only inside checkout (its policy); the storefront quotes nothing" },
  atomilicollectables: { status: "unmeasured", note: "Shows postage only inside checkout (its policy); the storefront quotes nothing" },
  // ── Stores listed in the US market that post from Canada (their Shopify
  //    /meta.json, checked 2026-09-25). A US buyer can owe import duties or a
  //    carrier's brokerage fee on delivery, on top of the postage quoted — unless
  //    the rate itself says duties are included (Danireon's UPS rate does). ──
  mythicstore: { shipsFrom: "Canada" }, // Quebec
  danireon: { shipsFrom: "Canada" }, // Ottawa
  npcollectibles: { shipsFrom: "Canada" }, // Markham, Ontario
  hobbiesville: { shipsFrom: "Canada" }, // Ottawa
  // ── Caveats on measured stores ──
  trextcg: { note: "An Italian store: quoted no postage to Spain, Germany, France or the Netherlands (Italy only, checked by hand)" },
  // ── Minimum orders, measured to the cent by hand (the probe's carts bracket them) ──
  dicesaloon: { minOrderCents: 500 }, // £4.50 got no rates, £5.00 got £3.50
  fourelements: { minOrderCents: 1015 }, // S$9.90 got no rates, S$10.15 got Registered S$2.90
  // ── Free postage applied as a Shopify automatic discount, invisible to the rates
  //    endpoint; read from the Storefront API's cart discountAllocations ──
  goattcg: { freeFromCents: 8000, freeNote: "a 'FREE SHIPPING' checkout discount (S$79.00 still pays)" },
  tefuda: { freeFromCents: 3000, freeNote: "a 'FREE SG SHIPPING' checkout discount (S$29.50 still pays)" },
  // ── A threshold a discarded run measured and the clean run's thin stock could not
  //    reach (its £50 rung stopped at £49.95, the next cart was £755.95) ──
  rollnplay: { freeFromCents: 5450, freeNote: "over about £50 (a £54.50 cart went free on the first UK run; £49.95 still paid)" },
};

/** Whether a zone holds any quoted rate at all (not just errors / empties). */
export function zoneHasPoints(z: Pick<SnapshotZone, "std" | "ltr">): boolean {
  return z.std.some(Boolean) || !!z.ltr?.some(Boolean);
}

/**
 * One store's probe output → its snapshot entry. Rates are RE-classified from
 * their names with the current classifier (a probe file carries whatever the
 * classifier said on the day it ran).
 */
export function condenseStore(s: ProbeStoreInput, override: ShippingOverride = SHIPPING_OVERRIDES[s.key] ?? {}): SnapshotStore {
  const base = {
    market: s.market,
    currency: s.currency,
    measuredAt: (s.measuredAt || "").slice(0, 10),
  };
  const usable = s.scenarios
    .filter((x) => !x.error && !x.sameCartAs && x.items > 0 && x.cartCurrency === s.currency)
    .sort((a, b) => a.subtotalCents - b.subtotalCents || a.items - b.items);
  const extra = {
    ...(override.freeFromCents ? { freeFromCents: override.freeFromCents, freeNote: override.freeNote } : {}),
    ...(override.shipsFrom ? { shipsFrom: override.shipsFrom } : {}),
  };
  if (!usable.length) {
    return {
      ...base,
      status: override.status ?? "unmeasured",
      note: override.note ?? (s.error ? `Not measured: ${s.error}` : "Not measured"),
      carts: [],
      names: [],
      zones: [],
      ...extra,
    };
  }

  const names: string[] = [];
  const nameIdx = (n: string) => {
    const i = names.indexOf(n);
    return i >= 0 ? i : names.push(n) - 1;
  };
  const carts: SnapshotCart[] = usable.map((x) => [x.subtotalCents, x.items]);

  type Built = Omit<SnapshotZone, "at">;
  const perAddress: { id: string; z: Built }[] = s.addresses.map((a) => {
    const std: (StdEntry | null)[] = [];
    const ltr: (LtrEntry | null)[] = [];
    const empty: number[] = [];
    const err: number[] = [];
    usable.forEach((x, j) => {
      const out = x.byAddress[a.id];
      if (!out || out.status === "error") {
        err.push(j);
        std.push(null);
        ltr.push(null);
        return;
      }
      if (out.status === "empty") {
        empty.push(j);
        std.push(null);
        ltr.push(null);
        return;
      }
      let bestStd: { cents: number; name: string; tracked: boolean; express: boolean } | null = null;
      let bestLtr: { cents: number; name: string; express: boolean } | null = null;
      for (const r of out.rates) {
        if (r.currency !== s.currency) continue; // never mix currencies
        const c = classifyRate(r.name);
        if (c.pickup) continue; // collected, not posted
        if (c.service === "untracked") {
          if (!bestLtr || r.cents < bestLtr.cents || (r.cents === bestLtr.cents && bestLtr.express && !c.express)) {
            bestLtr = { cents: r.cents, name: r.name, express: c.express };
          }
        } else {
          const tracked = c.service === "tracked";
          const better =
            !bestStd ||
            r.cents < bestStd.cents ||
            (r.cents === bestStd.cents && tracked && !bestStd.tracked) ||
            (r.cents === bestStd.cents && tracked === bestStd.tracked && bestStd.express && !c.express);
          if (better) bestStd = { cents: r.cents, name: r.name, tracked, express: c.express };
        }
      }
      if (!bestStd && !bestLtr) {
        // Only pickup (or other-currency) rates: nothing posted for this cart here.
        empty.push(j);
        std.push(null);
        ltr.push(null);
        return;
      }
      std.push(bestStd ? [bestStd.cents, nameIdx(bestStd.name), bestStd.tracked ? 1 : 0] : null);
      ltr.push(bestLtr ? [bestLtr.cents, nameIdx(bestLtr.name)] : null);
    });
    const z: Built = { std };
    if (ltr.some(Boolean)) z.ltr = ltr;
    if (empty.length) z.empty = empty;
    if (err.length) z.err = err;
    if (empty.length && empty.length + err.length === usable.length) z.none = true;
    return { id: a.id, z };
  });

  // Addresses quoted identically collapse into one zone (every AU store: the
  // same price to all eight capitals).
  const zones: SnapshotZone[] = [];
  const sig = (z: Built) => JSON.stringify([z.std, z.ltr ?? null, z.empty ?? null, z.err ?? null, z.none ?? null]);
  for (const { id, z } of perAddress) {
    const hit = zones.find((zz) => sig(zz) === sig(z));
    if (hit) hit.at.push(id);
    else zones.push({ at: [id], ...z });
  }
  // A zone where every quote ERRORED (a 429-exhausted or capped run leaves the
  // addresses it never reached that way) was not measured: it is neither
  // served nor "does not post". A store with nothing but such zones is
  // unmeasured, never "no-post" — that would drop it from Best Basket on the
  // strength of a failed request.
  const served = zones.some((z) => !z.none && zoneHasPoints(z));
  const erroredOnly = zones.some((z) => !z.none && !zoneHasPoints(z));
  const status: SnapshotStatus = override.status ?? (served ? "measured" : erroredOnly ? "unmeasured" : "no-post");
  const note =
    override.note ??
    (served ? undefined : erroredOnly ? "Not measured: every quote errored" : "Quoted no postage to any address we measured");
  // A minimum order the carts reveal: the smallest carts quoted nothing where
  // bigger ones were quoted (Dice Saloon, 4elements). The probe's rungs only
  // bracket it, so the first cart that WAS quoted is the safe figure; a
  // hand-checked override narrows it.
  let detectedMin = 0;
  for (const z of zones) {
    if (z.none || !z.empty?.includes(0)) continue;
    const firstQuoted = carts.findIndex((_, j) => !z.empty!.includes(j) && !(z.err ?? []).includes(j));
    if (firstQuoted > 0) detectedMin = Math.max(detectedMin, carts[firstQuoted][0]);
  }
  const minOrder = override.minOrderCents ?? (detectedMin || undefined);
  return {
    ...base,
    status,
    ...(note ? { note } : {}),
    carts,
    names,
    zones,
    ...extra,
    ...(minOrder ? { minOrderCents: minOrder } : {}),
  };
}
