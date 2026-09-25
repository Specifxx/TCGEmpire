// Best-Basket optimiser: the cheapest way to actually BUY a list of cards across
// the stores we track — minimising the grand total INCLUDING per-store postage and
// each store's free-shipping threshold. Buying every card from its individually
// cheapest store usually spreads the order over many stores and racks up postage;
// consolidating onto fewer stores (or pushing one store over its free-shipping
// threshold) often wins overall. That trade-off is exactly what this solves.
//
// ── Why an open-store search (rebuilt 2026-09-25) ────────────────────────────
// This used to be a greedy start plus a hill-climb that moved ONE card at a
// time. That can never empty a store holding two or more cards, and never opens
// a store whose postage is at least the postage it would save, so on the shapes
// real orders take it returned the greedy split unchanged:
//   • 4 cards, two $5-postage stores, each store cheapest for two of them:
//     $14.00 across two orders, when everything from one store is $9.40;
//   • a 12-card list over six small stores plus one store stocking all twelve
//     at +3%: six orders for $109.20 when one order was $104.80;
//   • 100 cards each 1c cheaper at its own store than at one hub store: $400
//     instead of $105.
// (Reproduced in the 2026-09-25 audit; pinned in tests/best-basket-optimiser.)
//
// The problem is uncapacitated facility location with a threshold twist, so
// this uses that problem's standard local search. The state is the set of OPEN
// stores; each card goes to its cheapest open store (a card no open store
// stocks force-opens its own cheapest store). Moves are ADD a store, DROP a
// store and SWAP one open store for a closed one, taking the best improving move
// until none helps, from several starts: the naive split, and each single store
// ranked by how much of the list it stocks. The old single-card move survives as
// the final polish, which is what crosses free-shipping thresholds. With ten or
// fewer candidate stores every open set is also tried outright.
//
// Exact minimisation is NP-hard, so the answer is the best this search finds,
// not a proof. What it guarantees: the plan is never dearer than the naive
// split, the best single-store order or the best two-store order, and the last
// two are returned beside it so the page can show them. Against brute force on
// 3,000 random lists of up to 6 cards and 5 stores it found the optimum every
// time. Pure CPU and deterministic: tens of milliseconds for a deck, ~300 ms in
// a synthetic worst case (200 cards, each stocked by half of 55 stores).

import { affiliateUrl } from "./affiliate";

export interface BasketListing {
  retailer: string; // store key
  // Not used here — store names come from RETAILERS via `stores`. Optional so a
  // caller can drop the column from its RetailerPrice select (egress).
  retailerName?: string;
  priceCents: number; // cheapest in-stock unit price at this store
  url: string;
  // The store's own condition label for that listing ("Near Mint", "LP"…),
  // shown on every plan line so a cheap played copy is never passed off as NM.
  condition?: string | null;
}

export interface BasketCard {
  cardId: string;
  name: string;
  slug: string | null;
  qty: number;
  listings: BasketListing[]; // one (cheapest) listing per store that stocks it
  // The printing, when known, so a plan line can say which one it is.
  setCode?: string;
  collectorNumber?: string;
}

export interface StoreShip {
  shippingFlatCents: number;
  freeOverCents: number; // 0 = no free-shipping threshold
}

export type BasketStores = Record<string, { name: string; ship: StoreShip }>;

export interface BasketLine {
  cardId: string;
  name: string;
  slug: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  qty: number;
  unitCents: number;
  url: string;
  condition: string | null;
}

export interface BasketStoreGroup {
  key: string;
  name: string;
  lines: BasketLine[];
  subtotalCents: number;
  shippingCents: number;
  freeShipping: boolean;
  // The store's postage model, so the page can say "free over $50" and how far
  // this order is from it.
  shippingFlatCents: number;
  freeOverCents: number;
}

export interface BasketPlan {
  stores: BasketStoreGroup[]; // dearest subtotal first
  itemsCents: number;
  shippingCents: number;
  totalCents: number;
  storeCount: number;
  // Buying each card from its individually-cheapest store (no consolidation).
  naiveTotalCents: number;
  naiveStoreCount: number;
  savedCents: number; // naiveTotal − total (≥ 0)
  unbuyable: { name: string; qty: number }[]; // no in-stock store listing found
  matchedCards: number; // distinct cards with at least one store listing
  coveredCopies: number; // copies this plan buys (qty summed)
}

export interface BasketAlternatives {
  // The cheapest order from ONE store that stocks every buyable card; null
  // when no single store does.
  singleStore: BasketPlan | null;
  // The cheapest order split across exactly TWO stores that between them stock
  // every buyable card; null when no pair does (or when every covering pair
  // collapses onto one store, which singleStore already reports).
  twoStores: BasketPlan | null;
}

export interface BasketResult {
  plan: BasketPlan;
  alternatives: BasketAlternatives;
}

export interface BasketOptions {
  // The page the store links are rendered on, for the affiliate sub-id
  // (affiliateUrl's `loc`). Without it every basket click reported "home".
  loc?: string;
}

// The aggregate a non-Premium caller is allowed to see: their own real numbers,
// with no store names, lines or links. Built server-side so the withheld parts
// never reach the response (the Deal Finder top-3 principle).
export interface BasketPreview {
  totalCents: number;
  shippingCents: number;
  storeCount: number;
  naiveTotalCents: number;
  savedCents: number;
  covered: number; // copies the plan buys
  requested: number; // copies asked for, incl. unbuyable and unmatched lines
  unmatched: { raw: string; qty: number }[];
}

export function basketPreview(plan: BasketPlan, unmatched: { raw: string; qty: number }[] = []): BasketPreview {
  const unbuyableCopies = plan.unbuyable.reduce((n, u) => n + u.qty, 0);
  const unmatchedCopies = unmatched.reduce((n, u) => n + u.qty, 0);
  return {
    totalCents: plan.totalCents,
    shippingCents: plan.shippingCents,
    storeCount: plan.storeCount,
    naiveTotalCents: plan.naiveTotalCents,
    savedCents: plan.savedCents,
    covered: plan.coveredCopies,
    requested: plan.coveredCopies + unbuyableCopies + unmatchedCopies,
    unmatched: unmatched.map((u) => ({ raw: u.raw, qty: u.qty })),
  };
}

// ── The solver ────────────────────────────────────────────────────────────────

// Everything indexed: cards 0..n-1, candidate stores 0..m-1 (only stores that
// stock at least one wanted card). unit[i*m+s] is card i's unit price at store
// s, Infinity where s doesn't stock it.
interface Model {
  n: number;
  m: number;
  qty: number[];
  unit: Float64Array;
  opts: number[][]; // per card: stores that stock it, cheapest first
  cardsAt: number[][]; // per store: cards it stocks
  ship: number[];
  freeOver: number[];
  // Scratch space for changeDelta, reused so a move costs no allocation.
  subD: Float64Array;
  cntD: Int32Array;
  mark: Uint8Array;
  touched: number[];
}

// A full assignment and its bookkeeping. cost = items + Σ postage(sub[s]).
interface State {
  assign: Int32Array;
  sub: Float64Array; // per-store subtotal
  cnt: Int32Array; // per-store number of cards assigned
  items: number;
  cost: number;
}

function postage(M: Model, s: number, sub: number, cnt: number): number {
  if (cnt <= 0) return 0;
  const free = M.freeOver[s];
  return free > 0 && sub >= free ? 0 : M.ship[s];
}

function stateFrom(M: Model, assign: Int32Array): State {
  const sub = new Float64Array(M.m);
  const cnt = new Int32Array(M.m);
  let items = 0;
  for (let i = 0; i < M.n; i++) {
    const s = assign[i];
    const line = M.unit[i * M.m + s] * M.qty[i];
    items += line;
    sub[s] += line;
    cnt[s]++;
  }
  let cost = items;
  for (let s = 0; s < M.m; s++) cost += postage(M, s, sub[s], cnt[s]);
  return { assign, sub, cnt, items, cost };
}

function cloneState(st: State): State {
  return { assign: st.assign.slice(), sub: st.sub.slice(), cnt: st.cnt.slice(), items: st.items, cost: st.cost };
}

// Every card to its cheapest store in `open`; a card no open store stocks
// force-opens its own cheapest store, which then competes for every card.
function assignToOpen(M: Model, open: Uint8Array): Int32Array {
  const isOpen = open.slice();
  for (let i = 0; i < M.n; i++) {
    if (!M.opts[i].some((s) => isOpen[s])) isOpen[M.opts[i][0]] = 1;
  }
  const assign = new Int32Array(M.n);
  for (let i = 0; i < M.n; i++) {
    const o = M.opts[i];
    let pick = o[0];
    for (const s of o) {
      if (isOpen[s]) {
        pick = s;
        break;
      }
    }
    assign[i] = pick;
  }
  return assign;
}

// The cost delta of a list of card moves, flattened as [card, store, card,
// store, …]; with `commit` the state is updated too.
function changeDelta(M: Model, st: State, changes: number[], commit: boolean): number {
  const { subD, cntD, mark, touched } = M;
  touched.length = 0;
  let itemsD = 0;
  for (let k = 0; k < changes.length; k += 2) {
    const i = changes[k];
    const to = changes[k + 1];
    const from = st.assign[i];
    if (from === to) continue;
    const before = M.unit[i * M.m + from] * M.qty[i];
    const after = M.unit[i * M.m + to] * M.qty[i];
    itemsD += after - before;
    if (!mark[from]) {
      mark[from] = 1;
      touched.push(from);
    }
    if (!mark[to]) {
      mark[to] = 1;
      touched.push(to);
    }
    subD[from] -= before;
    subD[to] += after;
    cntD[from]--;
    cntD[to]++;
  }
  let shipD = 0;
  for (const s of touched) {
    shipD += postage(M, s, st.sub[s] + subD[s], st.cnt[s] + cntD[s]) - postage(M, s, st.sub[s], st.cnt[s]);
  }
  const delta = itemsD + shipD;
  if (commit) {
    for (let k = 0; k < changes.length; k += 2) st.assign[changes[k]] = changes[k + 1];
    for (const s of touched) {
      st.sub[s] += subD[s];
      st.cnt[s] += cntD[s];
    }
    st.items += itemsD;
    st.cost += delta;
  }
  for (const s of touched) {
    subD[s] = 0;
    cntD[s] = 0;
    mark[s] = 0;
  }
  return delta;
}

// The same for one card, without the bookkeeping (the polish runs this a lot).
function singleDelta(M: Model, st: State, i: number, to: number): number {
  const from = st.assign[i];
  const before = M.unit[i * M.m + from] * M.qty[i];
  const after = M.unit[i * M.m + to] * M.qty[i];
  return (
    after -
    before +
    postage(M, from, st.sub[from] - before, st.cnt[from] - 1) -
    postage(M, from, st.sub[from], st.cnt[from]) +
    postage(M, to, st.sub[to] + after, st.cnt[to] + 1) -
    postage(M, to, st.sub[to], st.cnt[to])
  );
}

// ADD / DROP / SWAP, best improvement first, until nothing lowers the total.
//
// What each move does to the cards: DROP r sends r's cards to their cheapest
// store still open (or, when none stocks one, force-opens that card's own
// cheapest store); ADD a pulls every card that is cheaper at a than where it
// sits; SWAP r→a is both at once. Each iteration precomputes, per card, its
// best open store other than the one it is in, and per closed store the cards
// it would pull, so a move costs only the cards it actually touches.
function localSearch(M: Model, st: State, visited: Map<string, number>, run: number): boolean {
  const second = new Int32Array(M.n);
  const reach = new Uint8Array(M.m);
  const before = (i: number, x: number, y: number) => {
    // Does store x beat store y for card i? Price, then index (opts order).
    const ux = M.unit[i * M.m + x];
    const uy = M.unit[i * M.m + y];
    return ux < uy || (ux === uy && x < y);
  };
  for (let iter = 0; iter < 400; iter++) {
    // Another start already walked through this exact assignment, and the walk
    // from here is deterministic — it ends where that one did. (Meeting our
    // own trail just means this walk has converged.)
    const key = st.assign.join(",");
    const seenBy = visited.get(key);
    if (seenBy !== undefined && seenBy !== run) return false;
    visited.set(key, run);
    const open: number[] = [];
    const closed: number[] = [];
    for (let s = 0; s < M.m; s++) (st.cnt[s] > 0 ? open : closed).push(s);
    const assignedTo: number[][] = Array.from({ length: M.m }, () => []);
    for (let i = 0; i < M.n; i++) {
      assignedTo[st.assign[i]].push(i);
      let t = -1;
      for (const s of M.opts[i]) {
        if (s !== st.assign[i] && st.cnt[s] > 0) {
          t = s;
          break;
        }
      }
      second[i] = t;
    }
    const gainers: number[][] = Array.from({ length: M.m }, () => []);
    for (const a of closed) {
      for (const i of M.cardsAt[a]) if (before(i, a, st.assign[i])) gainers[a].push(i);
    }

    let bestD = 0;
    let best: number[] | null = null;
    const consider = (r: number, a: number) => {
      const ch: number[] = [];
      if (r >= 0) {
        for (const i of assignedTo[r]) {
          const t2 = second[i];
          let target: number;
          if (a >= 0 && M.unit[i * M.m + a] !== Infinity && (t2 < 0 || before(i, a, t2))) target = a;
          else target = t2 >= 0 ? t2 : M.opts[i][0];
          if (target !== r) ch.push(i, target);
        }
      }
      if (a >= 0) for (const i of gainers[a]) if (st.assign[i] !== r) ch.push(i, a);
      if (!ch.length) return;
      const d = changeDelta(M, st, ch, false);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = ch;
      }
    };
    if (open.length > 1) for (const r of open) consider(r, -1);
    for (const a of closed) if (gainers[a].length) consider(-1, a);
    for (const r of open) {
      // A swap whose new store stocks none of r's cards is just a DROP plus an
      // independent ADD, and neither of those improved on its own — skip it.
      reach.fill(0);
      for (const i of assignedTo[r]) for (const s of M.opts[i]) reach[s] = 1;
      for (const a of closed) if (reach[a]) consider(r, a);
    }
    if (!best) return true;
    changeDelta(M, st, best, true);
  }
  return true;
}

// The old hill-climb, kept as the polish: move ONE card to any store that
// stocks it when that lowers the total — which is what pushes a store over its
// free-shipping threshold. `allowed` restricts the target stores.
function polish(M: Model, st: State, allowed?: Uint8Array): void {
  for (let iter = 0; iter < 400; iter++) {
    let bestD = 0;
    let bestI = -1;
    let bestS = -1;
    for (let i = 0; i < M.n; i++) {
      for (const s of M.opts[i]) {
        if (s === st.assign[i] || (allowed && !allowed[s])) continue;
        const d = singleDelta(M, st, i, s);
        if (d < bestD - 1e-9) {
          bestD = d;
          bestI = i;
          bestS = s;
        }
      }
    }
    if (bestI < 0) return;
    changeDelta(M, st, [bestI, bestS], true);
  }
}

function storesUsed(st: State): number {
  let k = 0;
  for (let s = 0; s < st.cnt.length; s++) if (st.cnt[s] > 0) k++;
  return k;
}

// Lower total wins; on a tie, fewer orders.
function better(a: State, b: State | null): boolean {
  if (!b) return true;
  if (a.cost < b.cost - 1e-9) return true;
  if (a.cost > b.cost + 1e-9) return false;
  return storesUsed(a) < storesUsed(b);
}

// How many single-store starts to try, best-covering first. A store that
// stocks little of the list starts from nearly the naive split anyway, and
// the visited set below cuts those walks short.
const MAX_SINGLE_STARTS = 10;
// Up to this many candidate stores (1,023 open sets) the search also tries
// every open set outright. Most lists in the smaller markets land here.
const EXHAUSTIVE_MAX_STORES = 10;

function solve(M: Model, naive: State): State {
  let best: State | null = null;
  const visited = new Map<string, number>();
  let runs = 0;
  const run = (start: State) => {
    const id = runs++;
    const st = cloneState(start);
    for (let round = 0; round < 6; round++) {
      const before = st.cost;
      if (!localSearch(M, st, visited, id)) return;
      polish(M, st);
      if (st.cost >= before - 1e-9) break;
    }
    if (better(st, best)) best = st;
  };

  run(naive);

  // Single-store starts, ranked by coverage, then by what the covered cards
  // cost there, then by key order (deterministic).
  const ranked = [...Array(M.m).keys()]
    .map((s) => {
      let items = 0;
      for (const i of M.cardsAt[s]) items += M.unit[i * M.m + s] * M.qty[i];
      return { s, cover: M.cardsAt[s].length, items };
    })
    .sort((x, y) => y.cover - x.cover || x.items - y.items || x.s - y.s)
    .slice(0, MAX_SINGLE_STARTS);
  for (const { s } of ranked) {
    const open = new Uint8Array(M.m);
    open[s] = 1;
    run(stateFrom(M, assignToOpen(M, open)));
  }

  // With only a handful of candidate stores, every open set can simply be
  // tried (each polished within itself, for the thresholds) — which catches
  // the threshold interactions a one-move-at-a-time walk can step around.
  if (M.m <= EXHAUSTIVE_MAX_STORES) {
    const allowed = new Uint8Array(M.m);
    for (let mask = 1; mask < 1 << M.m; mask++) {
      for (let s = 0; s < M.m; s++) allowed[s] = (mask >> s) & 1;
      const assign = new Int32Array(M.n);
      let covers = true;
      for (let i = 0; i < M.n && covers; i++) {
        let pick = -1;
        for (const s of M.opts[i]) {
          if (allowed[s]) {
            pick = s;
            break;
          }
        }
        if (pick < 0) covers = false;
        else assign[i] = pick;
      }
      if (!covers) continue;
      const st = stateFrom(M, assign);
      polish(M, st, allowed);
      if (better(st, best)) best = st;
    }
  }
  return best ?? naive;
}

function bestSingleStore(M: Model): State | null {
  let best: State | null = null;
  for (let s = 0; s < M.m; s++) {
    if (M.cardsAt[s].length !== M.n) continue;
    const st = stateFrom(M, new Int32Array(M.n).fill(s));
    if (better(st, best)) best = st;
  }
  return best;
}

function bestTwoStores(M: Model): State | null {
  let best: State | null = null;
  for (let a = 0; a < M.m; a++) {
    for (let b = a + 1; b < M.m; b++) {
      const assign = new Int32Array(M.n);
      let covers = true;
      for (let i = 0; i < M.n; i++) {
        const ua = M.unit[i * M.m + a];
        const ub = M.unit[i * M.m + b];
        if (ua === Infinity && ub === Infinity) {
          covers = false;
          break;
        }
        assign[i] = ub < ua ? b : a;
      }
      if (!covers) continue;
      const st = stateFrom(M, assign);
      const allowed = new Uint8Array(M.m);
      allowed[a] = 1;
      allowed[b] = 1;
      polish(M, st, allowed);
      if (st.cnt[a] === 0 || st.cnt[b] === 0) continue; // collapsed to one store
      if (better(st, best)) best = st;
    }
  }
  return best;
}

// The full answer: the cheapest plan found plus the one- and two-store orders.
export function planBasket(cards: BasketCard[], stores: BasketStores, opts: BasketOptions = {}): BasketResult {
  return solveBasket(cards, stores, opts, true);
}

// Kept with its original signature (the portfolio's replacement cost calls it):
// the cheapest plan found, without the alternatives.
export function optimizeBasket(cards: BasketCard[], stores: BasketStores, opts: BasketOptions = {}): BasketPlan {
  return solveBasket(cards, stores, opts, false).plan;
}

function solveBasket(cards: BasketCard[], stores: BasketStores, opts: BasketOptions, withAlternatives: boolean): BasketResult {
  const unbuyable = cards
    .filter((c) => !c.listings.some((l) => Number.isFinite(l.priceCents)))
    .map((c) => ({ name: c.name, qty: c.qty }));
  const buyable = cards.filter((c) => c.listings.some((l) => Number.isFinite(l.priceCents)));

  // Candidate stores, in key order so every tie breaks the same way.
  const keys = [...new Set(buyable.flatMap((c) => c.listings.map((l) => l.retailer)))].sort();
  const idx = new Map(keys.map((k, i) => [k, i]));
  const n = buyable.length;
  const m = keys.length;
  const unit = new Float64Array(n * m).fill(Infinity);
  // Cheapest listing per (card, store), for the plan's link and condition.
  const listingAt: Map<number, BasketListing>[] = buyable.map(() => new Map());
  buyable.forEach((c, i) => {
    for (const l of c.listings) {
      if (!Number.isFinite(l.priceCents)) continue;
      const s = idx.get(l.retailer)!;
      if (l.priceCents < unit[i * m + s]) {
        unit[i * m + s] = l.priceCents;
        listingAt[i].set(s, l);
      }
    }
  });
  const optsPer: number[][] = buyable.map((_, i) => {
    const o: number[] = [];
    for (let s = 0; s < m; s++) if (unit[i * m + s] !== Infinity) o.push(s);
    return o.sort((x, y) => unit[i * m + x] - unit[i * m + y] || x - y);
  });
  const cardsAt: number[][] = keys.map(() => []);
  optsPer.forEach((o, i) => o.forEach((s) => cardsAt[s].push(i)));
  const M: Model = {
    n,
    m,
    qty: buyable.map((c) => c.qty),
    unit,
    opts: optsPer,
    cardsAt,
    ship: keys.map((k) => stores[k]?.ship.shippingFlatCents ?? 0),
    freeOver: keys.map((k) => stores[k]?.ship.freeOverCents ?? 0),
    subD: new Float64Array(m),
    cntD: new Int32Array(m),
    mark: new Uint8Array(m),
    touched: [],
  };

  const naive = stateFrom(M, Int32Array.from(optsPer.map((o) => o[0])));
  const naiveStoreCount = storesUsed(naive);

  const build = (st: State): BasketPlan => {
    const groups = new Map<number, BasketStoreGroup>();
    buyable.forEach((c, i) => {
      const s = st.assign[i];
      const key = keys[s];
      const listing = listingAt[i].get(s)!;
      let g = groups.get(s);
      if (!g) {
        g = {
          key,
          name: stores[key]?.name ?? key,
          lines: [],
          subtotalCents: 0,
          shippingCents: 0,
          freeShipping: false,
          shippingFlatCents: M.ship[s],
          freeOverCents: M.freeOver[s],
        };
        groups.set(s, g);
      }
      const u = unit[i * m + s];
      // Affiliate-tag the outbound line (eBay EPN / TCGplayer Impact / per-store).
      g.lines.push({
        cardId: c.cardId,
        name: c.name,
        slug: c.slug,
        setCode: c.setCode ?? null,
        collectorNumber: c.collectorNumber ?? null,
        qty: c.qty,
        unitCents: u,
        url: affiliateUrl(listing.url, key, opts.loc),
        condition: listing.condition ?? null,
      });
      g.subtotalCents += u * c.qty;
    });
    for (const g of groups.values()) {
      const free = g.freeOverCents > 0 && g.subtotalCents >= g.freeOverCents;
      g.freeShipping = free;
      g.shippingCents = free ? 0 : g.shippingFlatCents;
    }
    const storeGroups = [...groups.values()].sort((a, b) => b.subtotalCents - a.subtotalCents || a.key.localeCompare(b.key));
    const itemsCents = storeGroups.reduce((s, g) => s + g.subtotalCents, 0);
    const shippingCents = storeGroups.reduce((s, g) => s + g.shippingCents, 0);
    const totalCents = itemsCents + shippingCents;
    return {
      stores: storeGroups,
      itemsCents,
      shippingCents,
      totalCents,
      storeCount: storeGroups.length,
      naiveTotalCents: naive.cost,
      naiveStoreCount,
      savedCents: Math.max(0, naive.cost - totalCents),
      unbuyable,
      matchedCards: n,
      coveredCopies: buyable.reduce((s, c) => s + c.qty, 0),
    };
  };

  if (n === 0) {
    return { plan: build(naive), alternatives: { singleStore: null, twoStores: null } };
  }

  let best = solve(M, naive);
  // The alternatives are exact within their own shape, so the headline plan
  // must never be dearer than either — take the cheapest of them all.
  const single = bestSingleStore(M);
  const two = withAlternatives || M.m <= 60 ? bestTwoStores(M) : null;
  for (const alt of [single, two]) if (alt && better(alt, best)) best = alt;

  return {
    plan: build(best),
    alternatives: withAlternatives
      ? { singleStore: single ? build(single) : null, twoStores: two ? build(two) : null }
      : { singleStore: null, twoStores: null },
  };
}
