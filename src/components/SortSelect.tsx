"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "number", label: "Set & card number" },
  { value: "name", label: "Name: A–Z" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

export function SortSelect({ basePath = "/browse" }: { basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? "number";

  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(Array.from(params.entries()));
        next.set("sort", e.target.value);
        next.delete("page");
        router.push(`${basePath}?${next.toString()}`);
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
