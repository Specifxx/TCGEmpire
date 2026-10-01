"use client";

import { useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "", label: "Sort: Featured" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name", label: "Name: A–Z" },
  { value: "new", label: "Recently Added" },
];

// `basePath` and `options` (2026-10-01): the Pokémon section reuses this with
// its own sort list on /pokemon/sealed.
export function SealedSort({
  basePath = "/sealed",
  options = OPTIONS,
}: { basePath?: string; options?: { value: string; label: string }[] } = {}) {
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
        router.push(qs ? `${basePath}?${qs}` : basePath);
      }}
      className="input w-auto cursor-pointer"
      aria-label="Sort sealed products"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
