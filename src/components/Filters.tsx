"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  DOMAIN_KEYS,
  RARITY_KEYS,
  CARD_TYPES,
  CONDITION_KEYS,
  domainInfo,
  rarityInfo,
  conditionInfo,
} from "@/lib/constants";

function toggleCsv(current: string | null, value: string): string {
  const set = new Set(current ? current.split(",").filter(Boolean) : []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set).join(",");
}

export function Filters() {
  const router = useRouter();
  const params = useSearchParams();

  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");

  function update(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(Array.from(params.entries()));
    mutate(next);
    next.delete("page");
    router.push(`/?${next.toString()}`);
  }

  function isActive(key: string, value: string) {
    const v = params.get(key);
    return v ? v.split(",").includes(value) : false;
  }

  const activeCount =
    ["domain", "rarity", "type", "condition"].reduce(
      (n, k) => n + (params.get(k)?.split(",").filter(Boolean).length ?? 0),
      0
    ) +
    (params.get("foil") ? 1 : 0) +
    (params.get("min") || params.get("max") ? 1 : 0);

  return (
    <aside className="w-full shrink-0 lg:w-64">
      <div className="card-surface sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-300">
            Filters
          </h2>
          {activeCount > 0 && (
            <button
              onClick={() => router.push("/")}
              className="text-xs text-brand-400 hover:underline"
            >
              Clear ({activeCount})
            </button>
          )}
        </div>

        {/* Price range */}
        <Section title="Price (AUD)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              placeholder="Min"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="input"
            />
            <span className="text-slate-500">–</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Max"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              className="input"
            />
          </div>
          <button
            onClick={() =>
              update((p) => {
                if (min) p.set("min", min);
                else p.delete("min");
                if (max) p.set("max", max);
                else p.delete("max");
              })
            }
            className="btn-ghost mt-2 w-full"
          >
            Apply
          </button>
        </Section>

        {/* Domain */}
        <Section title="Domain">
          <div className="flex flex-col gap-1">
            {DOMAIN_KEYS.map((k) => {
              const d = domainInfo(k);
              return (
                <Check
                  key={k}
                  checked={isActive("domain", k)}
                  onChange={() => update((p) => setCsv(p, "domain", k, params))}
                  label={d.label}
                  dot={d.color}
                />
              );
            })}
          </div>
        </Section>

        {/* Rarity */}
        <Section title="Rarity">
          <div className="flex flex-col gap-1">
            {RARITY_KEYS.map((k) => (
              <Check
                key={k}
                checked={isActive("rarity", k)}
                onChange={() => update((p) => setCsv(p, "rarity", k, params))}
                label={k}
                dot={rarityInfo(k).color}
              />
            ))}
          </div>
        </Section>

        {/* Card type */}
        <Section title="Card type">
          <div className="flex flex-col gap-1">
            {CARD_TYPES.map((k) => (
              <Check
                key={k}
                checked={isActive("type", k)}
                onChange={() => update((p) => setCsv(p, "type", k, params))}
                label={k}
              />
            ))}
          </div>
        </Section>

        {/* Condition */}
        <Section title="Condition">
          <div className="flex flex-col gap-1">
            {CONDITION_KEYS.map((k) => (
              <Check
                key={k}
                checked={isActive("condition", k)}
                onChange={() => update((p) => setCsv(p, "condition", k, params))}
                label={`${conditionInfo(k).label} — ${conditionInfo(k).full}`}
                dot={conditionInfo(k).color}
              />
            ))}
          </div>
        </Section>

        {/* Foil */}
        <Section title="Finish" last>
          <Check
            checked={params.get("foil") === "1"}
            onChange={() =>
              update((p) => {
                if (p.get("foil") === "1") p.delete("foil");
                else p.set("foil", "1");
              })
            }
            label="Foil only ✦"
          />
        </Section>
      </div>
    </aside>
  );

  function setCsv(
    p: URLSearchParams,
    key: string,
    value: string,
    current: URLSearchParams
  ) {
    const next = toggleCsv(current.get(key), value);
    if (next) p.set(key, next);
    else p.delete(key);
  }
}

function Section({
  title,
  children,
  last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "pt-3" : "border-b border-ink-700 pb-3 pt-3"}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  dot,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  dot?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-300 hover:bg-ink-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-ink-600 bg-ink-900 accent-brand-500"
      />
      {dot && (
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
      )}
      <span className="truncate">{label}</span>
    </label>
  );
}
