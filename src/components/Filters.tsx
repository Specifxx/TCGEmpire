"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { track } from "@vercel/analytics";
import {
  DOMAIN_KEYS,
  RARITY_KEYS,
  CARD_TYPES,
  SETS,
  domainInfo,
  rarityInfo,
} from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { useCountry } from "./CountryProvider";

function toggleCsv(current: string | null, value: string): string {
  const set = new Set(current ? current.split(",").filter(Boolean) : []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set).join(",");
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Filters({ basePath = "/browse", hideSet = false, currency }: { basePath?: string; hideSet?: boolean; currency?: string }) {
  // Pages pass their server-side market (which honours /browse's ?market=), so
  // the SSR label and the hydrated one agree; the hook is only the fallback.
  const { country } = useCountry();
  const priceCurrency = currency ?? COUNTRIES[country].currency;
  const router = useRouter();
  const params = useSearchParams();
  const paramsStr = params.toString();
  const [, startTransition] = useTransition();

  // Optimistic copy of the query string so a checkbox toggles INSTANTLY on click,
  // without waiting for the server round-trip. We resync to the real URL whenever
  // it actually changes (navigation finished, or browser back/forward).
  const [optimistic, setOptimistic] = useState(paramsStr);
  useEffect(() => setOptimistic(paramsStr), [paramsStr]);
  const sp = useMemo(() => new URLSearchParams(optimistic), [optimistic]);

  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  function update(mutate: (p: URLSearchParams) => void, facet?: string) {
    // Build from the optimistic state (not the URL) so rapid clicks accumulate.
    const next = new URLSearchParams(optimistic);
    mutate(next);
    next.delete("page");
    const qs = next.toString();
    setOptimistic(qs); // instant: the checkbox flips immediately
    if (facet) track("filter_change", { facet });
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath)); // data loads in the background
  }

  function clearAll() {
    setOptimistic("");
    startTransition(() => router.push(basePath));
  }

  function isActive(key: string, value: string) {
    const v = sp.get(key);
    return v ? v.split(",").includes(value) : false;
  }

  function setCsv(p: URLSearchParams, key: string, value: string) {
    const nextVal = toggleCsv(sp.get(key), value);
    if (nextVal) p.set(key, nextVal);
    else p.delete(key);
  }

  const activeCount =
    ["domain", "rarity", "type", "set"].reduce(
      (n, k) => n + (sp.get(k)?.split(",").filter(Boolean).length ?? 0),
      0
    ) +
    (sp.get("variant") ? 1 : 0) +
    (sp.get("sig") ? 1 : 0) +
    (sp.get("over") ? 1 : 0) +
    (sp.get("promo") ? 1 : 0) +
    (sp.get("printing") ? 1 : 0) +
    (sp.get("priced") ? 1 : 0) +
    (sp.get("min") || sp.get("max") ? 1 : 0);

  return (
    <aside className="w-full shrink-0 xl:w-64">
      {/* Collapsible bar below xl, not just on phones (2026-09-23). Since the
          2026-09-21 rail change the 17rem SideNav is permanent from 1024px, so a
          256px sidebar there left the results a 424px column: 4 columns of 94px
          tiles at 1024, 29-54 clipped names/prices per page and an 8px sideways
          scroll (the "cost a card column" conflict in DECISIONS, 2026-09-10).
          From 1280 the sidebar has room again; below it this bar keeps the
          results at full width (704px at 1024). */}
      <button
        type="button"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((o) => !o)}
        className="mb-3 flex w-full items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm font-semibold text-white xl:hidden"
      >
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs">{activeCount}</span>
          )}
        </span>
        <Chevron open={mobileOpen} />
      </button>

      {/* The sticky sits on THIS wrapper, not the card-surface (2026-09-23). On
          the card-surface it never stuck: its containing block was this div, which
          is exactly as tall as the panel, so it scrolled away with the page
          (measured at 1280/1440, and at lg on the base). This div's containing
          block is the aside, which stretches to the results' height. */}
      <div className={`${mobileOpen ? "block" : "hidden"} xl:sticky xl:top-20 xl:block`}>
        <div className="card-surface xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto p-4">
          <div className="mb-1 flex items-center justify-between">
            {/* Hidden below xl, where the toggle bar right above already says
                "Filters" (2026-09-23: the open panel read Filters, then FILTERS).
                ml-auto keeps Clear right-aligned without it. */}
            <h2 className="hidden text-sm font-bold uppercase tracking-wide text-slate-300 xl:block">Filters</h2>
            {activeCount > 0 && (
              <button type="button" onClick={clearAll} className="ml-auto text-xs text-brand-400 hover:underline">
                Clear ({activeCount})
              </button>
            )}
          </div>

          {/* The MARKET column's currency, not a display currency: min/max filter
              priceField(country) (lib/cards.ts buildCardWhere), so a US visitor
              typing 5 filters on US$5. This label said "(AUD)" for everyone until
              2026-09-23. A UK visitor with EUR display still filters GBP. */}
          <Section title={`Price (${priceCurrency})`} defaultOpen>
            <div className="flex items-center gap-2">
              <input type="number" aria-label="Minimum price" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} className="input" />
              <span className="text-slate-500">–</span>
              <input type="number" aria-label="Maximum price" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} className="input" />
            </div>
            <button
              type="button"
              onClick={() =>
                update((p) => {
                  if (min) p.set("min", min); else p.delete("min");
                  if (max) p.set("max", max); else p.delete("max");
                }, "price")
              }
              className="btn-ghost mt-2 w-full"
            >
              Apply
            </button>
            <Check
              className="mt-2"
              checked={sp.get("priced") === "1"}
              onChange={() => update((p) => (p.get("priced") === "1" ? p.delete("priced") : p.set("priced", "1")), "priced")}
              label="Only cards with a price"
            />
          </Section>

          {!hideSet && (
            <Section title="Set" defaultOpen>
              <div className="flex flex-col gap-1">
                {SETS.map((s) => (
                  <Check key={s.code} checked={isActive("set", s.code)} onChange={() => update((p) => setCsv(p, "set", s.code), "set")} label={`${s.name} (${s.code})`} />
                ))}
              </div>
            </Section>
          )}

          <Section title="Domain">
            <div className="flex flex-col gap-1">
              {DOMAIN_KEYS.map((k) => {
                const d = domainInfo(k);
                return <Check key={k} checked={isActive("domain", k)} onChange={() => update((p) => setCsv(p, "domain", k), "domain")} label={d.label} dot={d.color} />;
              })}
            </div>
          </Section>

          <Section title="Rarity">
            <div className="flex flex-col gap-1">
              {RARITY_KEYS.map((k) => (
                <Check key={k} checked={isActive("rarity", k)} onChange={() => update((p) => setCsv(p, "rarity", k), "rarity")} label={k} dot={rarityInfo(k).color} />
              ))}
            </div>
          </Section>

          <Section title="Card type">
            <div className="flex flex-col gap-1">
              {CARD_TYPES.map((k) => (
                <Check key={k} checked={isActive("type", k)} onChange={() => update((p) => setCsv(p, "type", k), "type")} label={k} />
              ))}
            </div>
          </Section>

          <Section title="Printing" last defaultOpen>
            <div className="flex flex-col gap-1">
              {/* Normal hides all special prints; it's mutually exclusive with the
                  alt-art / signature / promo toggles below. */}
              <Check
                checked={sp.get("printing") === "normal"}
                onChange={() =>
                  update((p) => {
                    if (p.get("printing") === "normal") p.delete("printing");
                    else { p.set("printing", "normal"); p.delete("variant"); p.delete("sig"); p.delete("promo"); p.delete("over"); }
                  }, "printing:normal")
                }
                label="Normal only"
                dot="#34d17e"
              />
              <Check checked={sp.get("variant") === "alt"} onChange={() => update((p) => { p.delete("printing"); p.get("variant") === "alt" ? p.delete("variant") : p.set("variant", "alt"); }, "printing:alt")} label="Alternate art" dot="#f5a524" />
              <Check checked={sp.get("sig") === "1"} onChange={() => update((p) => { p.delete("printing"); p.get("sig") === "1" ? p.delete("sig") : p.set("sig", "1"); }, "printing:sig")} label="Signature" dot="#f59e0b" />
              <Check checked={sp.get("over") === "1"} onChange={() => update((p) => { p.delete("printing"); p.get("over") === "1" ? p.delete("over") : p.set("over", "1"); }, "printing:over")} label="Overnumbered" dot="#a855f7" />
              <Check checked={sp.get("promo") === "1"} onChange={() => update((p) => { p.delete("printing"); p.get("promo") === "1" ? p.delete("promo") : p.set("promo", "1"); }, "printing:promo")} label="Promo" dot="#06b6d4" />
            </div>
          </Section>

          {/* Below xl this panel is an inline disclosure, so after ticking a filter the results could sit ~1,700px below (390px, 2026-09-23). The footer pins to the viewport bottom while the panel is in view. pr-16 / sm:pr-36 keep the button clear of FeedbackWidget's fixed launcher. */}
          <div className="sticky bottom-0 -mx-4 -mb-4 mt-3 rounded-b-lg border-t border-ink-700 bg-ink-850/95 p-3 pr-16 backdrop-blur sm:pr-36 xl:hidden">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                setMobileOpen(false);
                // Scroll after the collapse has rendered, or the target is measured with the open panel still above it.
                requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ block: "start" }));
              }}
            >
              Show results
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
  defaultOpen = false,
  last,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  last?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={last ? "" : "border-b border-ink-700"}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        // min-h-11: was 40px; 44px with a mouse, 48px on touch via globals.css's
        // coarse-pointer rule (2026-09-23).
        className="flex min-h-11 w-full items-center justify-between py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
      >
        {title}
        <Chevron open={open} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  dot,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  dot?: string;
  className?: string;
}) {
  // tap-link-block: 24px rows on a mouse (no change), 48px on touch, where they
  // measured 324x24 (2026-09-23). The `flex` utility beats its inline-flex.
  return (
    <label className={`tap-link-block flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-300 hover:bg-ink-800 ${className ?? ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-ink-600 bg-ink-900 accent-brand-500" />
      {dot && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />}
      <span className="truncate">{label}</span>
    </label>
  );
}
