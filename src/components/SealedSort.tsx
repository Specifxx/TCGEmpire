"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "", label: "Sort: Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name", label: "Name: A–Z" },
];

export function SealedSort() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("sort") ?? "";

  return (
    <select
      value={current}
      onChange={(e) => {
        const next = new URLSearchParams(Array.from(params.entries()));
        if (e.target.value) next.set("sort", e.target.value);
        else next.delete("sort");
        const qs = next.toString();
        router.push(qs ? `/sealed?${qs}` : "/sealed");
      }}
      className="input w-auto cursor-pointer"
      aria-label="Sort sealed products"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
