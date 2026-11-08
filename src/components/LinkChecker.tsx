"use client";

// "Is this a good price?": paste a store's product link, see how its price compares with every store we read in that store's
// market. The browser asks /check/<host> for that store's listings and each product's cheapest and median in-stock store price
// (CDN-cached, from the committed price files: the store is never fetched), finds the pasted listing and says where its price sits
// (lib/link-check.ts priceVerdict). A link we can't place (eBay, Amazon, a store we don't read, a page we never matched) falls back
// to a search from the link's own words. The file is static, written with every page at the release's build.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { article, findOffer, marketplaceName, parseLink, priceVerdict, type CheckProduct, type StoreCheck, type Verdict } from "@/lib/link-check";


type Hit = { slug: string; href: string; name: string; set: string };

type Lookup =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "not-a-link" }
  | { kind: "fallback"; why: string; hits: Hit[] | null }
  | { kind: "found"; store: StoreCheck; product: CheckProduct; priceCents: number; inStock: boolean };

const TONE: Record<Verdict, string> = {
  best: "border-emerald-500/50 text-emerald-300",
  good: "border-emerald-500/40 text-emerald-300",
  typical: "border-ink-700 text-slate-100",
  high: "border-brand-500/60 text-brand-400",
  unknown: "border-ink-700 text-slate-400",
};

/** Words a store or marketplace puts around a product's name that our names may not carry. */
const NOISE = new Set(
  "new the a of and for with free shipping official sale riftbound league legends tcg card single singles nm near mint english".split(" "),
);

const COUNTRY: Record<string, string> = { AU: "Australia", NZ: "New Zealand", US: "the US", UK: "the UK", GB: "the UK", SG: "Singapore", CA: "Canada", EU: "Europe" };

function ago(iso: string, now = Date.now()): string {
  const h = (now - new Date(iso).getTime()) / 3_600_000;
  if (!Number.isFinite(h)) return "recently";
  if (h < 1) return "under an hour ago";
  return h < 48 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`;
}

const storeCache = new Map<string, Promise<StoreCheck | null>>();
function loadStore(host: string): Promise<StoreCheck | null> {
  let p = storeCache.get(host);
  if (!p) {
    p = fetch(`/api/check/${encodeURIComponent(host)}`, { headers: { accept: "application/json" } }).then(async (res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`check: HTTP ${res.status}`);
      const body = (await res.json()) as StoreCheck;
      if (body?.v !== 1 || !Array.isArray(body.offers)) throw new Error("check: unexpected body");
      return body;
    });
    p.catch(() => storeCache.delete(host));
    storeCache.set(host, p);
  }
  return p;
}

function parsePrice(input: string): number | null {
  const s = input.trim().replace(/[^\d.,]/g, "");
  if (!s) return null;
  const decimalComma = s.includes(",") && (s.includes(".") ? s.lastIndexOf(",") > s.lastIndexOf(".") : /,\d{2}$/.test(s));
  const n = Number(decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function Figure({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-display text-2xl font-black tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function LinkChecker({ example }: { example?: string }) {
  const [text, setText] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [price, setPrice] = useState("");
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const check = useCallback(async (raw: string) => {
    const n = ++seq.current;
    setFailed(false);
    const link = parseLink(raw);
    if (!link) {
      setLookup(raw.trim() ? { kind: "not-a-link" } : { kind: "idle" });
      return;
    }
    setLookup({ kind: "loading" });
    const fallback = (why: string) => {
      if (n !== seq.current) return;
      const all = link.words.split(" ");
      const q = all.filter((w) => !NOISE.has(w)).join(" ") || link.words;
      setLookup({ kind: "fallback", why, hits: q ? [{ slug: q, href: `/browse?q=${encodeURIComponent(q)}`, name: `Search “${q}”`, set: "Every store’s price for the matching products" }] : [] });
    };
    const market = marketplaceName(link.host);
    if (market) return fallback(`That’s ${article(market)} ${market} link. We compare stores, so we can’t read ${market}’s price from a link. Search for the product at every store we read:`);
    try {
      const store = await loadStore(link.host);
      if (n !== seq.current) return;
      if (!store) return fallback(`We don’t read ${link.host} yet, so we can’t see its price. Search for it at the stores we do read:`);
      const offer = findOffer(store.offers, link);
      const product = offer ? store.products?.[offer[1]] : undefined;
      if (!offer || !product) return fallback(`We read ${store.name}, but that page isn’t one we’ve matched to a product. Search for it by the link’s words:`);
      setPrice((offer[2] / 100).toFixed(2));
      setLookup({ kind: "found", store, product, priceCents: offer[2], inStock: offer[3] === 1 });
    } catch {
      if (n === seq.current) {
        setFailed(true);
        setLookup({ kind: "idle" });
      }
    }
  }, []);

  // A link handed over in the address (#link=…) is checked on arrival. A fragment, never a query: the CDN keeps one copy.
  useEffect(() => {
    try {
      const l = new URLSearchParams(window.location.hash.slice(1)).get("link");
      if (l) {
        setText(l);
        void check(l);
      }
    } catch {
      /* no address to read */
    }
  }, [check]);

  const found = lookup.kind === "found" ? lookup : null;
  const currency = found?.store.currency ?? "USD";
  const m = (c: number) => {
    try {
      return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(c / 100);
    } catch {
      return (c / 100).toFixed(2);
    }
  };
  const countryName = COUNTRY[found?.store.region ?? ""] ?? "that store’s country";
  const priceCents = parsePrice(price);
  const outHere = !!found && !found.inStock && priceCents === found.priceCents;
  const verdict = found
    ? outHere
      ? {
          verdict: "unknown" as Verdict,
          headline: "Out of stock at this store",
          detail: found.product.cheapestCents != null ? `It was out of stock when we last checked. The cheapest in-stock store price we found is ${m(found.product.cheapestCents)}.` : "It was out of stock when we last checked, and no other store we read has it in stock either.",
        }
      : priceCents
        ? priceVerdict({ priceCents, cheapestCents: found.product.cheapestCents, medianCents: found.product.medianCents, inStockStores: found.product.inStockStores, money: m })
        : null
    : null;

  return (
    <section aria-label="Is this a good price?" className="card-surface mt-6 p-4 sm:p-6" data-tool="">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void check(text);
        }}
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="block min-w-0">
          <span className="mb-1.5 block text-sm font-semibold">Paste a store’s product link</span>
          <input
            type="url"
            inputMode="url"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const v = e.clipboardData.getData("text");
              if (v) {
                e.preventDefault();
                setText(v);
                void check(v);
              }
            }}
            placeholder={example ?? "https://store.example/products/…"}
            autoComplete="off"
            spellCheck={false}
            className="input"
          />
          <span className="mt-1 block text-xs text-slate-400">{failed ? "That didn’t load. Check your connection and try again." : "Any store’s product page. We compare it with every store we read in that store’s country."}</span>
        </label>
        <button type="submit" className="btn-primary">
          Check the price
        </button>
      </form>

      <div aria-live="polite">
        {lookup.kind === "loading" && <p className="mt-4 text-sm text-slate-400">Looking it up…</p>}
        {lookup.kind === "not-a-link" && <p className="mt-4 text-sm text-slate-400">That doesn’t look like a link. Paste the whole address from the store’s product page, starting with https://.</p>}

        {lookup.kind === "fallback" && (
          <div className="mt-5">
            <p className="text-sm leading-6">{lookup.why}</p>
            <ul className="mt-3 divide-y divide-ink-700 overflow-hidden rounded-xl border border-ink-700">
              {lookup.hits == null ? (
                <li className="px-4 py-3 text-sm text-slate-400">Searching…</li>
              ) : lookup.hits.length ? (
                lookup.hits.map((h) => (
                  <li key={h.href}>
                    <Link href={h.href} prefetch={false} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-800">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{h.name}</span>
                        <span className="block truncate text-xs text-slate-400">{h.set}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-brand-400">Search →</span>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-sm text-slate-400">Nothing matched the link’s words. Try the search at the top of the page.</li>
              )}
            </ul>
          </div>
        )}

        {found && (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{found.product.name}</h2>
              <Link href={found.product.href} prefetch={false} className="text-sm font-semibold text-brand-400 hover:underline">
                Every store’s price →
              </Link>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Compared with the stores we read in {countryName}, in {currency}, before postage. Singles compare Near Mint copies.
            </p>

            {verdict && (
              <div className={`mt-4 rounded-xl border-2 bg-ink-900 px-4 py-3 ${TONE[verdict.verdict]}`}>
                <p className="font-display text-xl font-black">{verdict.headline}</p>
                <p className="mt-1 text-sm leading-6 text-slate-100">{verdict.detail}</p>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Figure label={found.store.name} value={m(found.priceCents)} sub={`${found.inStock ? "In stock" : "Out of stock"} when we last checked${found.store.checkedAt ? `, ${ago(found.store.checkedAt)}` : ""}`} />
              <Figure
                label="Cheapest in stock"
                value={found.product.cheapestCents != null ? m(found.product.cheapestCents) : "Sold out"}
                tone="text-brand-400"
                sub={`${found.product.inStockStores} of ${found.product.listedStores} ${found.product.listedStores === 1 ? "store" : "stores"} in stock`}
              />
              <Figure label="Median in stock" value={found.product.medianCents != null ? m(found.product.medianCents) : "—"} sub="What a typical store asks" />
            </div>

            <label className="mt-4 block max-w-xs">
              <span className="mb-1.5 block text-sm font-semibold">Price on the page now</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input tabular-nums"
              />
              <span className="mt-1 block text-xs text-slate-400">Changed since we checked? Type what the page shows.</span>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
