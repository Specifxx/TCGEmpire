"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  // Keep the box in sync if the URL changes (e.g. back button).
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(Array.from(params.entries()));
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    next.delete("page");
    router.push(`/?${next.toString()}`);
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
      />
    </form>
  );
}
