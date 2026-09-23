"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

// Faceted sidebar filter for /sealed — the same pattern as the card database
// Filters, with sealed-relevant facets (product type, set, price, stock).
// Options are passed in from the server (only the sets/types that actually have
// sealed products in the current market).

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

export function SealedFilters({
  types,
  sets,
  currency = "AUD",
}: {
  types: string[];
  sets: { code: string; name: string }[];
  currency?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const paramsStr = params.toString();
  const [, startTransition] = useTransition();

  const [optimistic, setOptimistic] = useState(paramsStr);
  useEffect(() => setOptimistic(paramsStr), [paramsStr]);
  const sp = useMemo(() => new URLSearchParams(optimistic), [optimistic]);

  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [setQuery, setSetQuery] = useState("");

  const filteredSets = useMemo(() => {
    const term = setQuery.trim().toLowerCase();
    if (!term) return sets;
    return sets.filter((s) => s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term));
  }, [setQuery, sets]);

  function update(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(optimistic);
    mutate(next);
    const qs = next.toString();
    setOptimistic(qs);
    startTransition(() => router.push(qs ? `/sealed?${qs}` : "/sealed"));
  }

  function clearAll() {
    const next = new URLSearchParams();
    const q = sp.get("q");
    if (q) next.set("q", q);
    const qs = next.toString();
    setOptimistic(qs);
    startTransition(() => router.push(qs ? `/sealed?${qs}` : "/sealed"));
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
    ["type", "set"].reduce((n, k) => n + (sp.get(k)?.split(",").filter(Boolean).length ?? 0), 0) +
    (sp.get("instock") ? 1 : 0) +
    (sp.get("atmsrp") ? 1 : 0) +
    (sp.get("min") || sp.get("max") ? 1 : 0);

  return (
    <aside className="w-full shrink-0 xl:w-64">
      {/* Collapsible bar below xl, the same boundary as the card database's
          Filters (2026-09-23). With the 17rem rail permanent from 1024px, a
          256px sidebar there squeezed /sealed to 3 columns of 131px tiles with
          46 of 72 clipped. From 1280 the sidebar has room again. */}
      <button
        onClick={() => setMobileOpen((o) => !o)}
        aria-expanded={mobileOpen}
        className="mb-3 flex w-full items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm font-semibold text-white xl:hidden"
      >
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs">{activeCount}</span>}
        </span>
        <Chevron open={mobileOpen} />
      </button>

      {/* Sticky on this wrapper, not the card-surface: there it never stuck,
          because this div was its containing block and is exactly as tall as the
          panel (2026-09-23; see Filters.tsx). */}
      <div className={`${mobileOpen ? "block" : "hidden"} xl:sticky xl:top-20 xl:block`}>
        <div className="card-surface xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto p-4">
          <div className="mb-1 flex items-center justify-between">
            {/* Hidden below xl, where the toggle bar right above already says
                "Filters" (2026-09-23). ml-auto keeps Clear right-aligned without it. */}
            <h2 className="hidden text-sm font-bold uppercase tracking-wide text-slate-300 xl:block">Filters</h2>
            {activeCount > 0 && (
              <button onClick={clearAll} className="ml-auto text-xs text-brand-400 hover:underline">
                Clear ({activeCount})
              </button>
            )}
          </div>

          <Section title={`Price (${currency})`} defaultOpen>
            <div className="flex items-center gap-2">
              <input type="number" aria-label="Minimum price" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} className="input" />
              <span className="text-slate-500">–</span>
              <input type="number" aria-label="Maximum price" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} className="input" />
            </div>
            <button
              onClick={() =>
                update((p) => {
                  if (min) p.set("min", min); else p.delete("min");
                  if (max) p.set("max", max); else p.delete("max");
                })
              }
              className="btn-ghost mt-2 w-full"
            >
              Apply
            </button>
            <Check
              className="mt-2"
              checked={sp.get("instock") === "1"}
              onChange={() => update((p) => (p.get("instock") === "1" ? p.delete("instock") : p.set("instock", "1")))}
              label="In stock only"
            />
            <Check
              className="mt-2"
              checked={sp.get("atmsrp") === "1"}
              onChange={() => update((p) => (p.get("atmsrp") === "1" ? p.delete("atmsrp") : p.set("atmsrp", "1")))}
              label="In stock at MSRP"
            />
          </Section>

          <Section title="Product type" defaultOpen>
            <div className="flex flex-col gap-1">
              {types.map((t) => (
                <Check key={t} checked={isActive("type", t)} onChange={() => update((p) => setCsv(p, "type", t))} label={t} />
              ))}
              {types.length === 0 && <span className="px-1 py-2 text-xs text-slate-500">No product types yet.</span>}
            </div>
          </Section>

          {sets.length > 0 && (
            <Section title="Set" last defaultOpen>
              {sets.length > 8 && (
                <input
                  type="search"
                  value={setQuery}
                  onChange={(e) => setSetQuery(e.target.value)}
                  placeholder={`Search ${sets.length} sets…`}
                  className="input mb-2 w-full text-sm"
                />
              )}
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                {filteredSets.map((s) => (
                  <Check key={s.code} checked={isActive("set", s.code)} onChange={() => update((p) => setCsv(p, "set", s.code))} label={s.name} />
                ))}
                {filteredSets.length === 0 && (
                  <span className="px-1 py-2 text-xs text-slate-500">No sets match &ldquo;{setQuery}&rdquo;.</span>
                )}
              </div>
            </Section>
          )}

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
  className,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  // tap-link-block: 24px rows on a mouse (no change), 48px on touch, where they
  // measured 324x24 (2026-09-23). The `flex` utility beats its inline-flex.
  return (
    <label className={`tap-link-block flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-300 hover:bg-ink-800 ${className ?? ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-ink-600 bg-ink-900 accent-brand-500" />
      <span className="truncate">{label}</span>
    </label>
  );
}
