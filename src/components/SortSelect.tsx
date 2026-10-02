"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "popular", label: "Most popular" },
  { value: "number", label: "Set & card number" },
  { value: "name", label: "Name: A–Z" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "new", label: "Recently Added" },
];

// `options` (2026-10-02): /price-guide has its own list (7-day change, stores);
// /browse and the set pages keep OPTIONS. Choosing the page's default writes no
// `sort` at all, so the default order stays the clean, indexable URL.
export function SortSelect({
  basePath = "/browse",
  defaultSort = "number",
  options = OPTIONS,
}: {
  basePath?: string;
  defaultSort?: string;
  options?: readonly { value: string; label: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? defaultSort;

  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(Array.from(params.entries()));
        if (e.target.value === defaultSort) next.delete("sort");
        else next.set("sort", e.target.value);
        next.delete("page");
        const qs = next.toString();
        router.push(qs ? `${basePath}?${qs}` : basePath);
      }}
      className="input w-auto cursor-pointer"
      aria-label="Sort listings"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
