import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { priceField } from "@/lib/country";
import { parseDeckList, resolveDeckLines, DECK_LINE_CAP } from "@/lib/deck";
import { rateLimit } from "@/lib/rate-limit";
import { basketPreview, optimizeBasket, planBasket, type BasketCard } from "@/lib/basket";
import { loadBinderHoldings, loadOwnedQty, loadStoreListings, loadWatchlistCardIds, marketStores } from "@/lib/basket-server";

export const dynamic = "force-dynamic";

// Best Basket: turn a list into the cheapest delivered order across this
// market's stores (lib/basket.ts's open-store search, rebuilt 2026-09-25).
//
// WHO GETS WHAT. Any signed-in account can run it; the ANSWER is tiered here,
// server-side, not in the page:
//   • Premium (isPremium(user, "premium")): the full plan — every store, every
//     line with its condition and link — beside the best one-store and
//     two-store orders, plus the unmatched and fuzzy-matched lines.
//   • Everyone else signed in: their own real numbers only — delivered total,
//     postage, store count, the naive cheapest-per-card total and the saving,
//     cards covered out of requested, and the lines we couldn't match. No
//     store names, lines or URLs are in the response at all (withheld, not
//     hidden — the Deal Finder top-3 principle). Click-only in the UI, and 5 a
//     day here.
//
// WHAT CAN BE SENT. { source: "deck" } with a pasted `text` and/or exact
// `lines` ({ cardId, qty }, from the search-and-add picker or a handoff);
// { source: "watchlist" } — the cards this account watches in this market;
// { source: "binder" } — the cards it holds (replacement: the binder has no
// notion of missing cards, see lib/basket-server.ts). `skipOwned` subtracts
// the copies the account already holds (meaningless for the binder itself,
// so ignored there).
//
// Rate limits are in-memory per instance (lib/rate-limit.ts), so the free
// 5-a-day cap is soft; the 200-card cap and the click-only UI bound it too.

interface PickedLine {
  cardId: string;
  qty: number;
}

type Source = "deck" | "watchlist" | "binder";

const clampQty = (q: number) => Math.max(1, Math.min(99, Math.round(q)));

const HOUR = 3_600_000;
const DAY = 86_400_000;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const full = isPremium(user, "premium");

  const rl = full ? rateLimit(`basket-premium:${user.id}`, 30, HOUR) : rateLimit(`basket:${user.id}`, 5, DAY);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: full
          ? "That's a lot of baskets in an hour — give it a few minutes and try again."
          : "Free accounts get 5 basket totals a day, and you've used today's. Try again tomorrow.",
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const country = getCountry();
  const body = await req.json().catch(() => null);
  const source: Source = body?.source === "watchlist" || body?.source === "binder" ? body.source : "deck";
  const skipOwned = body?.skipOwned === true && source !== "binder";
  const text: string = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  const picked: PickedLine[] = Array.isArray(body?.lines)
    ? body.lines
        .filter((l: unknown): l is PickedLine => !!l && typeof (l as PickedLine).cardId === "string" && Number.isFinite((l as PickedLine).qty))
        .slice(0, DECK_LINE_CAP)
    : [];

  try {
    // 1. What was asked for → cardId → qty (+ what we know about each card).
    const wanted = new Map<string, number>();
    const info = new Map<string, { name: string; slug: string | null; setCode: string; collectorNumber: string }>();
    const unmatched: { raw: string; qty: number }[] = [];
    const fuzzy: { raw: string; matchedAs: string }[] = [];
    let skippedHoldings = 0;
    const add = (cardId: string, qty: number) => wanted.set(cardId, clampQty((wanted.get(cardId) ?? 0) + qty));

    if (source === "watchlist") {
      const ids = await loadWatchlistCardIds(user.id, country);
      if (!ids.length) return NextResponse.json({ error: "Your watchlist has no cards in this market yet." }, { status: 400 });
      for (const id of ids) add(id, 1);
    } else if (source === "binder") {
      const binder = await loadBinderHoldings(user.id, country);
      if (binder.empty) return NextResponse.json({ error: "Nothing in your binder yet." }, { status: 400 });
      for (const h of binder.wanted) {
        add(h.cardId, h.qty);
        info.set(h.cardId, h);
      }
      skippedHoldings = binder.skipped;
    } else {
      for (const l of picked) add(l.cardId, clampQty(l.qty));
      if (text.trim()) {
        const orderBy = [{ [priceField(country)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput];
        const resolved = await resolveDeckLines(parseDeckList(text, { plainNames: true }), (args) =>
          prisma.card.findMany({
            ...args,
            select: { id: true, name: true, slug: true, nameNormalized: true, setCode: true, collectorNumber: true },
            orderBy,
          })
        );
        for (const m of resolved.matched) {
          add(m.card.id, m.line.qty);
          info.set(m.card.id, m.card);
          if (m.fuzzy) fuzzy.push({ raw: m.line.raw, matchedAs: m.card.name });
        }
        for (const u of resolved.unmatched) unmatched.push({ raw: u.raw, qty: u.qty });
      }
      if (!wanted.size && !unmatched.length) {
        return NextResponse.json({ error: "Paste a list or add a card first." }, { status: 400 });
      }
    }

    // Keep the list inside the cap, whatever mix of sources filled it.
    for (const id of [...wanted.keys()].slice(DECK_LINE_CAP)) wanted.delete(id);

    // 2. "Skip copies I already own."
    let skippedOwned = 0;
    if (skipOwned && wanted.size) {
      const owned = await loadOwnedQty(user.id, [...wanted.keys()]);
      for (const [id, qty] of [...wanted]) {
        const have = Math.min(owned.get(id) ?? 0, qty);
        if (have <= 0) continue;
        skippedOwned += have;
        if (have >= qty) wanted.delete(id);
        else wanted.set(id, qty - have);
      }
      if (!wanted.size && !unmatched.length) {
        return NextResponse.json({ error: "You already own every card on this list." }, { status: 400 });
      }
    }

    // 3. Names for cards that arrived as bare ids (picker, watchlist).
    const missing = [...wanted.keys()].filter((id) => !info.has(id));
    if (missing.length) {
      const cards = await prisma.card.findMany({
        where: { id: { in: missing } },
        select: { id: true, name: true, slug: true, setCode: true, collectorNumber: true },
      });
      for (const c of cards) info.set(c.id, c);
      // An id that isn't a card (stale watch, bad client) is dropped.
      for (const id of missing) if (!info.has(id)) wanted.delete(id);
    }

    // 4. In-stock listings at this market's stores. Throws rather than
    // pricing a failed read as "nothing in stock".
    const { allowed, stores } = marketStores(country);
    const listings = await loadStoreListings([...wanted.keys()], country, allowed);
    const basketCards: BasketCard[] = [...wanted].map(([cardId, qty]) => {
      const c = info.get(cardId)!;
      return {
        cardId,
        name: c.name,
        slug: c.slug,
        setCode: c.setCode,
        collectorNumber: c.collectorNumber,
        qty,
        listings: listings.get(cardId) ?? [],
      };
    });

    // 5. The answer, tiered.
    if (!full) {
      return NextResponse.json(basketPreview(optimizeBasket(basketCards, stores), unmatched), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const { plan, alternatives } = planBasket(basketCards, stores, { loc: "/tools/best-basket" });
    return NextResponse.json(
      { ...basketPreview(plan, unmatched), plan, alternatives, fuzzy, skippedOwned, skippedHoldings, source },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[basket] query failed", e);
    return NextResponse.json(
      { error: "Store prices are unavailable right now, so we can't build a basket. Try again in a few minutes." },
      { status: 503 }
    );
  }
}
