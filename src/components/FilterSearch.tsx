"use client";

import { useEffect, useRef, useState } from "react";
import { KEYWORD_MAX } from "@/lib/filter-params";

// The keyword box at the top of a filter panel (2026-10-19, owner: "there
// should be a search bar in the filters as well … so you don't need to use the
// search bar at the top of the website"). It writes the page's existing `q`,
// combined with every ticked filter (lib/filter-params.ts applyKeyword).
//
// APPLIED ON ENTER OR THE BUTTON, NEVER PER KEYSTROKE. Each applied search is a
// server render: on /browse two uncached Postgres queries plus the sealed match,
// and a metered search when the allowance is on (lib/search-quota.ts), where a
// half-typed word corrected mid-way ("jinx" → "jax") would count twice. It is
// the panel's own model too: the price boxes wait for Apply.
//
// The text follows the URL: a header search, back/forward or a chip removal
// that changes `q` rewrites it; any other navigation leaves what the visitor
// is typing alone.
export function FilterSearch({
  id,
  action,
  current,
  placeholder,
  onApply,
  blurOnApply = false,
}: {
  id: string;
  /** The page's path: without JavaScript the form is a plain GET search there. */
  action: string;
  /** The `q` in force (the panel's optimistic copy of the URL). */
  current: string;
  placeholder: string;
  onApply: (text: string) => void;
  /** Drop the phone keyboard after a search, so the results and "Show results" are not hidden behind it. */
  blurOnApply?: boolean;
}) {
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);
  const input = useRef<HTMLInputElement>(null);

  function apply(next: string) {
    // The same words again would only re-render the same page.
    if (next.trim() !== current) onApply(next);
    if (blurOnApply) input.current?.blur();
  }

  return (
    <form
      role="search"
      action={action}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        apply(text);
      }}
      className="border-b border-ink-700 pb-3"
    >
      <label htmlFor={id} className="flex min-h-11 items-center text-xs font-semibold uppercase tracking-wide text-slate-400">
        Search
      </label>
      <input
        ref={input}
        id={id}
        type="search"
        name="q"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={KEYWORD_MAX}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        className="input"
      />
      <div className="mt-2 flex gap-2">
        <button type="submit" className="btn-ghost flex-1">
          Search
        </button>
        {current && (
          <button
            type="button"
            onClick={() => {
              setText("");
              apply("");
            }}
            className="btn-ghost px-3"
            aria-label="Clear the search"
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
