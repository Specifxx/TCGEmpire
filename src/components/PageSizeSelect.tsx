"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { PAGE_SIZES } from "@/lib/cards";

// Lets the user choose how many cards to show per page (10/20/50/100). Changing
// it resets to page 1.
export function PageSizeSelect({ size }: { size: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set("size", e.target.value);
    next.delete("page");
    startTransition(() => router.push(`/browse?${next.toString()}`));
  }

  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      <span className="hidden sm:inline">Show</span>
      <select value={size} onChange={onChange} className="input w-auto py-1.5" aria-label="Cards per page">
        {PAGE_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
