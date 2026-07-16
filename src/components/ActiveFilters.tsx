"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const CSV_KEYS = ["domain", "rarity", "type", "set"];

// Skinport-style "applied filters" row: every active filter shown as a removable
// chip above the results, so it's obvious what's filtered and easy to undo.
export function ActiveFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const chips: { key: string; value: string; label: string }[] = [];
  for (const key of CSV_KEYS) {
    const v = params.get(key);
    if (v) for (const val of v.split(",").filter(Boolean)) chips.push({ key, value: val, label: val });
  }
  if (params.get("variant") === "alt") chips.push({ key: "variant", value: "", label: "Alt art" });
  if (params.get("sig") === "1") chips.push({ key: "sig", value: "", label: "Signature" });
  if (params.get("over") === "1") chips.push({ key: "over", value: "", label: "Overnumbered" });
  if (params.get("promo") === "1") chips.push({ key: "promo", value: "", label: "Promo" });
  const rules = params.get("rules");
  if (rules) chips.push({ key: "rules", value: "", label: rules.replace(/[[\]]/g, "") });
  if (params.get("priced") === "1") chips.push({ key: "priced", value: "", label: "Has price" });
  const min = params.get("min");
  const max = params.get("max");
  if (min || max) chips.push({ key: "price", value: "", label: `$${min ?? "0"}–${max ?? "∞"}` });

  if (chips.length === 0) return null;

  function go(next: URLSearchParams) {
    next.delete("page");
    startTransition(() => router.push(`/browse?${next.toString()}`));
  }

  function remove(key: string, value: string) {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (key === "price") {
      next.delete("min");
      next.delete("max");
    } else if (CSV_KEYS.includes(key)) {
      const remaining = (next.get(key) ?? "").split(",").filter((x) => x && x !== value);
      if (remaining.length) next.set(key, remaining.join(",")); else next.delete(key);
    } else {
      next.delete(key);
    }
    go(next);
  }

  function clearAll() {
    const next = new URLSearchParams();
    const q = params.get("q");
    if (q) next.set("q", q);
    const sort = params.get("sort");
    if (sort) next.set("sort", sort);
    go(next);
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={() => remove(c.key, c.value)}
          className="chip gap-1.5 bg-brand-500/15 font-medium text-brand-300 hover:bg-brand-500/25"
        >
          {c.label}
          <span aria-hidden className="text-brand-400/70">✕</span>
        </button>
      ))}
      <button onClick={clearAll} className="text-xs text-slate-500 hover:text-white">Clear all</button>
    </div>
  );
}
