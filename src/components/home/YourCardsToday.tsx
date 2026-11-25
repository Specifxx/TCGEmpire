"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { useMe } from "@/lib/use-me";
import { useCountry } from "@/components/CountryProvider";
import { cardHref } from "@/lib/card-url";
import { armOf, changeSince, sparkPath, YCT_ARM_KEY, YCT_DAY_KEY, YCT_MOVED_KEY, YCT_SEEN_KEY } from "@/lib/your-cards-today";

// "Your cards today" (2026-11-18, retention job C; owner: members' phones should feel different): a signed-in account that watches
// cards sees them first on the home page, each with today's price, the change since their last look and a 30-day sparkline.
// Browser only (the home page's server HTML and cache are untouched), nothing for a visitor without an account or watches.
// A 50/50 test (`yct-arm` in localStorage): the "off" arm sees nothing, so visit days per eligible account read on against off.
// Events: yct_eligible {arm} and yct_shown once a day, yct_click on a card. Price rows, buy buttons and the quick view are
// elsewhere and untouched. It also sets `yct-moved` for the phone bar's Watching dot (BottomNav.tsx).

type Item = { id: string; slug: string | null; name: string; image: string | null; priceCents: number | null; spark: number[] };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the strip still shows, without a "since last look" change */
  }
}

export function YourCardsToday() {
  const { user, loaded } = useMe();
  const { country, fmt } = useCountry();
  const [items, setItems] = useState<Item[] | null>(null);
  const [prev, setPrev] = useState<Record<string, number>>({});
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!loaded || !user) return;
    let alive = true;
    fetch(`/api/alerts/today?country=${country}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items?: Item[] }) => {
        if (!alive) return;
        const list = d.items ?? [];
        if (!list.length) return setItems([]);
        const a = armOf(read(YCT_ARM_KEY));
        if (a.store) write(YCT_ARM_KEY, a.store);
        const today = new Date().toISOString().slice(0, 10);
        const first = read(YCT_DAY_KEY) !== today;
        if (first) {
          write(YCT_DAY_KEY, today);
          try {
            track("yct_eligible", { arm: a.arm });
            if (a.arm === "on") track("yct_shown", { n: list.length });
          } catch {
            /* analytics never blocks the page */
          }
        }
        let seen: Record<string, number> = {};
        try {
          seen = JSON.parse(read(YCT_SEEN_KEY) ?? "{}") ?? {};
        } catch {
          seen = {};
        }
        const moved = list.some((i) => {
          const d = changeSince(seen[i.id], i.priceCents);
          return d != null && d !== 0;
        });
        if (moved && a.arm === "on") write(YCT_MOVED_KEY, "1"); // the dot is part of the "on" arm only
        // The next visit compares against today. Only the cards shown are kept, so the snapshot stays small.
        write(YCT_SEEN_KEY, JSON.stringify(Object.fromEntries(list.filter((i) => i.priceCents != null).map((i) => [i.id, i.priceCents]))));
        setPrev(seen);
        setOn(a.arm === "on");
        setItems(list);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [loaded, user, country]);

  if (!on || !items?.length) return null;

  return (
    <section aria-labelledby="yct-h" className="card-surface p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="yct-h" className="text-lg font-bold text-slate-100">Your cards today</h2>
        <Link href="/watching" prefetch={false} className="text-sm font-semibold text-brand-400 hover:underline">
          All watched cards
        </Link>
      </div>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {items.map((i) => {
          const d = changeSince(prev[i.id], i.priceCents);
          const path = sparkPath(i.spark);
          const up = path && i.spark[i.spark.length - 1] >= i.spark[0];
          return (
            <li key={i.id} className="w-36 shrink-0 snap-start">
              <Link
                href={cardHref(i)}
                prefetch={false}
                onClick={() => {
                  try {
                    track("yct_click", { moved: d != null && d !== 0 });
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex h-full flex-col gap-1.5 rounded-lg border border-ink-800 bg-ink-950 p-2 hover:border-ink-700"
              >
                {i.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.image} alt="" aria-hidden="true" loading="lazy" width={128} height={179} className="mx-auto h-24 w-auto rounded object-contain" />
                ) : (
                  <span className="h-24" />
                )}
                <span className="line-clamp-2 text-xs font-semibold text-slate-200">{i.name}</span>
                <span className="text-sm font-bold text-slate-100">{i.priceCents != null ? fmt(i.priceCents) : "Not in stock"}</span>
                <span className={`text-xs font-semibold ${d == null || d === 0 ? "text-slate-400" : d < 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {d == null ? "Watching" : d === 0 ? "Same as last visit" : `${d < 0 ? "▼" : "▲"} ${fmt(Math.abs(d))} since last visit`}
                </span>
                {path && (
                  <svg viewBox="0 0 64 20" width="100%" height="20" aria-hidden="true" preserveAspectRatio="none">
                    <polyline points={path} fill="none" strokeWidth="1.5" className={up ? "stroke-rose-400" : "stroke-emerald-400"} />
                  </svg>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
