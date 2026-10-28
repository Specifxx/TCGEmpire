"use client";

import { useState } from "react";

/** One search box for every game: sends the words to the chosen site's own search. */
export function FamilySearchForm({ sites }: { sites: { key: string; name: string; game: string; search: string }[] }) {
  const [q, setQ] = useState("");
  const [key, setKey] = useState(sites[0]?.key ?? "");
  return (
    <form
      role="search"
      className="mt-4 flex flex-col gap-2 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        const site = sites.find((s) => s.key === key);
        const term = q.trim().slice(0, 80);
        if (!site || !term) return;
        window.location.href = site.search.replace("{q}", encodeURIComponent(term));
      }}
    >
      <label className="sr-only" htmlFor="family-game">Game</label>
      <select id="family-game" value={key} onChange={(e) => setKey(e.target.value)} className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white">
        {sites.map((s) => (
          <option key={s.key} value={s.key}>{s.game}</option>
        ))}
      </select>
      <label className="sr-only" htmlFor="family-q">Card or product</label>
      <input
        id="family-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Card or product name"
        className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
      />
      <button type="submit" className="btn-primary">Compare prices</button>
    </form>
  );
}
