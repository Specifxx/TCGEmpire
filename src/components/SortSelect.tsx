"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "newest", label: "Newest listings" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name", label: "Name: A–Z" },
];

export function SortSelect() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? "newest";

  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(Array.from(params.entries()));
        next.set("sort", e.target.value);
        next.delete("page");
        router.push(`/?${next.toString()}`);
      }}
      className="input w-auto cursor-pointer"
      aria-label="Sort listings"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
