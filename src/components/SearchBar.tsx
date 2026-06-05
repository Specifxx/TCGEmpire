"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// Plain search: submitting navigates to the results page (a real page load with a
// loading state) instead of waiting for a type-ahead dropdown to populate.
export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  return (
    <form onSubmit={submit} className="relative max-w-xl">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search cards, champions, sets…"
        className="input pl-9"
        aria-label="Search cards"
        autoComplete="off"
        enterKeyHint="search"
      />
    </form>
  );
}
