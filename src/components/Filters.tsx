"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DOMAIN_KEYS,
  RARITY_KEYS,
  CARD_TYPES,
  SETS,
  domainInfo,
  rarityInfo,
} from "@/lib/constants";

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

export function Filters({ basePath = "/browse", hideSet = false }: { basePath?: string; hideSet?: boolean }) {
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

  function update(mutate: (p: URLSearchParams) => void) {
    // Build from the optimistic state (not the URL) so rapid clicks accumulate.
    const next = new URLSearchParams(optimistic);
    mutate(next);
    next.delete("page");
    const qs = next.toString();
    setOptimistic(qs); // instant: the checkbox flips immediately
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
    <aside className="w-full shrink-0 lg:w-64">
      {/* Mobile toggle */}
      <button
        type="button"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((o) => !o)}
        className="mb-3 flex w-full items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm font-semibold text-white lg:hidden"
      >
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs">{activeCount}</span>
          )}
        </span>
        <Chevron open={mobileOpen} />
      </button>

      <div className={`${mobileOpen ? "block" : "hidden"} lg:block`}>
        <div className="card-surface lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">Filters</h2>
            {activeCount > 0 && (
              <button type="button" onClick={clearAll} className="text-xs text-brand-400 hover:underline">
                Clear ({activeCount})
              </button>
            )}
          </div>

          <Section title="Price (AUD)" defaultOpen>
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
                })
              }
              className="btn-ghost mt-2 w-full"
            >
              Apply
            </button>
            <Check
              className="mt-2"
              checked={sp.get("priced") === "1"}
              onChange={() => update((p) => (p.get("priced") === "1" ? p.delete("priced") : p.set("priced", "1")))}
              label="Only cards with a price"
            />
          </Section>

          {!hideSet && (
            <Section title="Set" defaultOpen>
              <div className="flex flex-col gap-1">
                {SETS.map((s) => (
                  <Check key={s.code} checked={isActive("set", s.code)} onChange={() => update((p) => setCsv(p, "set", s.code))} label={`${s.name} (${s.code})`} />
                ))}
              </div>
            </Section>
          )}

          <Section title="Domain">
            <div className="flex flex-col gap-1">
              {DOMAIN_KEYS.map((k) => {
                const d = domainInfo(k);
                return <Check key={k} checked={isActive("domain", k)} onChange={() => update((p) => setCsv(p, "domain", k))} label={d.label} dot={d.color} />;
              })}
            </div>
          </Section>

          <Section title="Rarity">
            <div className="flex flex-col gap-1">
              {RARITY_KEYS.map((k) => (
                <Check key={k} checked={isActive("rarity", k)} onChange={() => update((p) => setCsv(p, "rarity", k))} label={k} dot={rarityInfo(k).color} />
              ))}
            </div>
          </Section>

          <Section title="Card type">
            <div className="flex flex-col gap-1">
              {CARD_TYPES.map((k) => (
                <Check key={k} checked={isActive("type", k)} onChange={() => update((p) => setCsv(p, "type", k))} label={k} />
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
                  })
                }
                label="Normal only"
                dot="#34d17e"
              />
              <Check checked={sp.get("variant") === "alt"} onChange={() => update((p) => { p.delete("printing"); p.get("variant") === "alt" ? p.delete("variant") : p.set("variant", "alt"); })} label="Alternate art" dot="#f5a524" />
              <Check checked={sp.get("sig") === "1"} onChange={() => update((p) => { p.delete("printing"); p.get("sig") === "1" ? p.delete("sig") : p.set("sig", "1"); })} label="Signature" dot="#f59e0b" />
              <Check checked={sp.get("over") === "1"} onChange={() => update((p) => { p.delete("printing"); p.get("over") === "1" ? p.delete("over") : p.set("over", "1"); })} label="Overnumbered" dot="#a855f7" />
              <Check checked={sp.get("promo") === "1"} onChange={() => update((p) => { p.delete("printing"); p.get("promo") === "1" ? p.delete("promo") : p.set("promo", "1"); })} label="Promo" dot="#06b6d4" />
            </div>
          </Section>
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
        className="flex w-full items-center justify-between py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200"
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
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-300 hover:bg-ink-800 ${className ?? ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-ink-600 bg-ink-900 accent-brand-500" />
      {dot && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />}
      <span className="truncate">{label}</span>
    </label>
  );
}
