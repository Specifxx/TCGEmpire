"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { useQuickView } from "./QuickView";
import { useCountry } from "./CountryProvider";
import type { CardTileData } from "./CardTile";
import { cardImageAlt } from "@/lib/image-alt";
import { gaEvent } from "@/lib/ga-events";

// How long a focused-but-not-yet-typing field has to stay focused before it
// counts as "focus with intent" for search_initiated below — long enough that
// a tab-through or an accidental click-and-immediate-blur doesn't count, short
// enough that a visitor who focused the box and is composing what to type
// still gets counted before they've necessarily typed anything.
const FOCUS_INTENT_MS = 1200;

// Baymard's autocomplete audit: cap suggestions at 10 on desktop, 4-8 on
// mobile — more causes choice paralysis, and an uncapped list is also how you
// end up needing a scrollbar inside the dropdown (Baymard: never do that;
// show fewer rows instead). 6 sits in the middle of the mobile range.
const DESKTOP_SUGGESTION_CAP = 10;
const MOBILE_SUGGESTION_CAP = 6;

// Recent searches (per-browser, no account needed) — the other half of
// Baymard's zero-state guidance, alongside trending chips.
const RECENT_SEARCHES_KEY = "rc_recent_searches";
const MAX_RECENT_SEARCHES = 5;

type Result = CardTileData;
type SealedResult = {
  groupKey: string;
  name: string;
  productType: string;
  setCode: string | null;
  imageUrl: string | null;
  lowestPriceCents: number | null;
};

function loadRecentSearches(): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, MAX_RECENT_SEARCHES);
  } catch {
    // Storage unavailable/corrupt (private browsing, quota, hand-edited value)
    // — the feature is inert, not broken. Same fail-open shape as Riftle's
    // and TradeCalculator's localStorage reads elsewhere in this codebase.
    return [];
  }
}

function persistRecentSearch(term: string): string[] {
  const trimmed = term.trim();
  const next = [trimmed, ...loadRecentSearches().filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT_SEARCHES);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    /* best-effort only — a full/blocked store just means it isn't remembered next time */
  }
  return next;
}

// Cap follows the viewport, per Baymard (10 desktop / 4-8 mobile — see the
// constants above). Defaults to the desktop cap so the very first client
// render (before this effect's matchMedia read) never has to invent a number
// — the dropdown itself only ever renders after a user interaction anyway
// (`open` starts false), so this can't cause a hydration mismatch.
function useSuggestionCap(): number {
  const [cap, setCap] = useState(DESKTOP_SUGGESTION_CAP);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setCap(mq.matches ? MOBILE_SUGGESTION_CAP : DESKTOP_SUGGESTION_CAP);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return cap;
}

// Bold ONLY the predicted remainder of a suggestion, never the part the
// visitor already typed — the reverse of what most sites do, and the pattern
// Baymard's testing found actually helps: the visitor already knows what they
// typed, so the useful new information is what comes after it. No match (a
// typo/fuzzy hit that isn't a literal substring, or an empty query in the
// zero-state) just renders plain.
function HighlightedLabel({ label, query }: { label: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{label}</>;
  const idx = label.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{label}</>;
  const typedEnd = idx + q.length;
  return (
    <>
      {label.slice(0, typedEnd)}
      <strong className="font-bold text-white">{label.slice(typedEnd)}</strong>
    </>
  );
}

// Small "recent search" glyph — a plain clock, not a card thumbnail, so a
// recalled query never looks like it points at one specific card.
function RecentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Search with a live preview dropdown (debounced + abortable so typing stays
// snappy). Submitting still does a real navigation to the results page.
//
// `variant="hero"` is the same component, just sized up for the homepage hero
// (wider, larger type/touch target, higher-contrast fill — see the `isHero`
// input classes below) with the hero's own placeholder copy — there's exactly
// one search implementation, wired once, reused in both spots.
//
// `autoFocusDesktop` focuses the input on mount, but ONLY when BOTH hold:
// viewport ≥1024px AND the primary pointer is "fine" (mouse/trackpad, per
// `matchMedia('(pointer: fine)')`) — not just the width gate this used to
// have alone. A touch tablet or phone-in-desktop-mode browser can be ≥1024px
// wide; stealing focus there still pops the on-screen keyboard and eats a
// third of the viewport before the visitor has read anything, which is
// exactly what a screen-width check alone doesn't catch. A laptop with BOTH a
// touchscreen and a trackpad still passes — matchMedia('pointer') reports the
// PRIMARY pointer, and a trackpad/mouse is that device's primary input even
// though touch is also available, so autofocus correctly still fires there.
// This is deliberately never the HTML `autofocus` attribute — MDN's a11y
// guidance is explicit that it teleports screen-reader users with no warning;
// focusing via an effect after mount, gated like this, is what Scryfall does.
export function SearchBar({
  variant = "nav",
  autoFocusDesktop = false,
  trendingCards,
}: {
  variant?: "nav" | "hero";
  autoFocusDesktop?: boolean;
  // Zero-state suggestions (focused + empty box) alongside recent searches.
  // Only ever passed by the hero, which already has this data server-side for
  // the always-visible TrendingChips row below the box — see CinematicHero's
  // doc comment on why the nav variant doesn't get it. Undefined degrades
  // gracefully to "recent searches only" in the zero-state dropdown.
  trendingCards?: CardTileData[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { open: openQuickView } = useQuickView();
  const { fmt, price } = useCountry();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<Result[]>([]);
  const [sealed, setSealed] = useState<SealedResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // search_initiated fires exactly once per mount — the first sign a visitor
  // is actually trying to search, not every keystroke/focus after that.
  const initiatedRef = useRef(false);
  const focusIntentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set right before the autofocus effect below calls .focus() programmatically,
  // and read (then cleared) by onFocus — see that effect's own comment for why
  // this exists: without it, autoFocusDesktop's own focus() call triggered
  // onFocus's normal "open the zero-state dropdown" behavior, popping the
  // trending-suggestions panel open on every desktop page load before the
  // visitor did anything at all — covering the trending chips/stats/link/region
  // toggle underneath it with an already-open dropdown showing the exact same
  // six trending cards a second time. A REAL subsequent focus (the visitor
  // clicking or tabbing back into the box) is untouched: this flag is
  // one-shot, consumed by the very next onFocus regardless of cause.
  const suppressNextFocusOpenRef = useRef(false);
  const suggestionCap = useSuggestionCap();
  // Stable per-instance id prefix — up to 3 SearchBars are mounted on the same
  // page at once (nav desktop, nav mobile, hero), and their listbox/option ids
  // must not collide.
  const uid = useId();
  const listboxId = `search-listbox-${uid}`;
  const optionId = (i: number) => `search-option-${uid}-${i}`;

  // search_initiated: "first keystroke OR focus-with-intent" per the
  // measurement brief — two different signals feeding one event, because both
  // are evidence of the same thing (a visitor engaging with search), just
  // with different timing. A keystroke is unambiguous and fires immediately.
  // A bare focus is not on its own (tabbing past the field, or a click that's
  // about to become something else, both focus it) — so a focus only counts
  // once it's been held for FOCUS_INTENT_MS without either blurring or typing
  // (typing marks `initiated` itself, so the pending timer below becomes a
  // no-op when it eventually fires).
  function markInitiated(trigger: "keystroke" | "focus_dwell") {
    if (initiatedRef.current) return;
    initiatedRef.current = true;
    gaEvent("search_initiated", { trigger, variant });
  }

  function clearFocusIntentTimer() {
    if (focusIntentTimerRef.current != null) {
      clearTimeout(focusIntentTimerRef.current);
      focusIntentTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (autoFocusDesktop && window.matchMedia("(min-width: 1024px)").matches && window.matchMedia("(pointer: fine)").matches) {
      // The whole point of autoFocusDesktop is "let the visitor start typing
      // immediately" — it is not itself a signal that they want to BROWSE the
      // zero-state dropdown, so the onFocus handler below must not treat this
      // programmatic focus like a real one.
      suppressNextFocusOpenRef.current = true;
      inputRef.current?.focus();
    }
    // Mount-only: re-focusing on every re-render would steal focus back from
    // whatever the visitor moved to next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global "/" shortcut — focuses whichever mounted SearchBar instance is
  // actually visible right now (there can be 2-3 in the DOM simultaneously:
  // nav desktop, nav mobile, hero — see the visibility check below). Skipped
  // entirely while focus is already inside any input/textarea/contenteditable
  // so it never steals a keystroke from another field.
  useEffect(() => {
    function isVisible(el: HTMLElement): boolean {
      // offsetParent is null for display:none (and its ancestors) — catches
      // the Navbar's own `hidden .../lg:block` breakpoint swap and the
      // homepage-only scroll-gated header search (HeaderSearchSlot) alike.
      if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      // Also require on-screen right now, not just "not display:none" — an
      // instance that's merely scrolled out of view (e.g. the hero's box
      // after scrolling past it) still has a non-null offsetParent, so
      // without this a scrolled-away hero box could still "win" the
      // shortcut over the now-visible header box.
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      const tag = active?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (active instanceof HTMLElement && active.isContentEditable);
      if (isEditable) return;
      const el = inputRef.current;
      if (!el || !isVisible(el)) return;
      e.preventDefault();
      el.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Tear down a pending focus-intent timer if the component unmounts while
  // it's running (e.g. navigating away right after focusing the box).
  useEffect(() => clearFocusIntentTimer, []);

  // Debounced fetch of preview results.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setSealed([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        const nextResults: Result[] = data.results ?? [];
        const nextSealed: SealedResult[] = data.sealed ?? [];
        setResults(nextResults);
        setSealed(nextSealed);
        // A free product-gap report: every distinct, debounced-settled query
        // that came back completely empty. Firing per settled query (not per
        // keystroke — the 180ms debounce above already collapses a fast typist
        // down to the strings they actually paused on) keeps this from
        // flooding GA4 while still catching every real miss, including
        // transient ones the visitor typed past on the way to a hit.
        if (nextResults.length === 0 && nextSealed.length === 0) {
          gaEvent("search_no_results", { query: q, variant });
        }
      } catch {
        /* aborted or failed — ignore */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [value, variant]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function trackCardView(card: Result) {
    fetch(`/api/card/${card.slug ?? card.id}/view?source=search`, { method: "POST", keepalive: true }).catch(() => {});
  }

  // Shared by both the card-result and trending rows (same underlying
  // CardTileData shape) and by both the mouse plain-click branch AND the
  // keyboard Enter path — a MODIFIER mouse click does NOT go through this
  // (it lets the real `<a href>` open a new tab natively; see each row's
  // onClick below), only a modifier held on keyboard Enter does, since there
  // Enter has no native href-click to fall back on.
  function activateCardLike(card: Result, rank: number, resultType: "card" | "trending", newTab: boolean) {
    trackCardView(card);
    gaEvent("search_suggestion_selected", { suggestion_rank: rank, result_type: resultType, query: value.trim(), card_id: card.id, variant });
    if (newTab) {
      window.open(cardHref(card), "_blank", "noopener");
      return;
    }
    setOpen(false);
    setActiveIndex(-1);
    openQuickView(card);
  }

  // Keyboard-only counterpart to the sealed row's onClick below (which relies
  // on a real anchor click for navigation) — Enter has no href to fall back
  // on, so this navigates explicitly.
  function activateSealed(s: SealedResult, rank: number, newTab: boolean) {
    gaEvent("search_suggestion_selected", { suggestion_rank: rank, result_type: "sealed", query: value.trim(), variant });
    const href = `/sealed?q=${encodeURIComponent(s.name)}`;
    if (newTab) {
      window.open(href, "_blank", "noopener");
      return;
    }
    setOpen(false);
    setActiveIndex(-1);
    router.push(href);
  }

  // The single place a query actually gets "submitted" — Enter/"See all
  // results" in the form, and selecting a recent-search suggestion (which is,
  // functionally, resubmitting that exact past query).
  function commitSearch(term: string, opts?: { newTab?: boolean }) {
    const q = term.trim();
    gaEvent("search_submitted", { query: q, variant });
    setRecentSearches(persistRecentSearch(q));
    const href = q ? `/browse?q=${encodeURIComponent(q)}` : "/browse";
    if (opts?.newTab) {
      window.open(href, "_blank", "noopener");
      return;
    }
    setOpen(false);
    setActiveIndex(-1);
    router.push(href);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    commitSearch(value);
  }

  const trimmed = value.trim();
  const isZeroState = trimmed.length < 2;

  // No scrollbar in the dropdown, ever (Baymard) — achieved by construction:
  // cap the row COUNT per breakpoint rather than capping the panel's height
  // and letting it scroll. Cards/trending come first (the higher-intent
  // signal), sealed/recent fill whatever budget is left.
  const visibleResults = useMemo(() => results.slice(0, suggestionCap), [results, suggestionCap]);
  const visibleSealed = useMemo(() => sealed.slice(0, Math.max(0, suggestionCap - visibleResults.length)), [sealed, suggestionCap, visibleResults.length]);
  const visibleTrending = useMemo(() => (trendingCards ?? []).slice(0, suggestionCap), [trendingCards, suggestionCap]);
  const visibleRecent = useMemo(() => recentSearches.slice(0, Math.max(0, suggestionCap - visibleTrending.length)), [recentSearches, suggestionCap, visibleTrending.length]);

  const suggestionCount = isZeroState ? visibleTrending.length + visibleRecent.length : visibleResults.length + visibleSealed.length;
  // Zero-state only opens when there's actually something to show (trending
  // and/or recent) — an empty dropdown flashing open on focus with nothing in
  // it would be worse than not opening at all. Query-state always opens once
  // ≥2 chars are typed, even with zero matches, so the "no matches — press
  // Enter anyway" message has somewhere to render.
  const showDropdown = open && (isZeroState ? suggestionCount > 0 : trimmed.length >= 2);

  // What's currently "active" (arrowed-to) — resolved against whichever list
  // is actually showing, so Enter and the highlight/aria-activedescendant
  // always agree with what the visitor sees.
  const activeSuggestion = useMemo(() => {
    if (activeIndex < 0) return null;
    if (isZeroState) {
      if (activeIndex < visibleTrending.length) return { kind: "trending" as const, card: visibleTrending[activeIndex], rank: activeIndex + 1 };
      const ri = activeIndex - visibleTrending.length;
      if (ri < visibleRecent.length) return { kind: "recent" as const, term: visibleRecent[ri], rank: activeIndex + 1 };
      return null;
    }
    if (activeIndex < visibleResults.length) return { kind: "card" as const, card: visibleResults[activeIndex], rank: activeIndex + 1 };
    const si = activeIndex - visibleResults.length;
    if (si < visibleSealed.length) return { kind: "sealed" as const, sealed: visibleSealed[si], rank: activeIndex + 1 };
    return null;
  }, [activeIndex, isZeroState, visibleTrending, visibleRecent, visibleResults, visibleSealed]);

  // The arrowed-to suggestion's plain text copies into the field so the
  // visitor can keep editing from it — the underlying `value` (what's
  // actually driving the debounced fetch) is untouched until they actually
  // type, which is what onChange below resets activeIndex for.
  const displayValue = activeSuggestion
    ? activeSuggestion.kind === "sealed"
      ? activeSuggestion.sealed.name
      : activeSuggestion.kind === "recent"
        ? activeSuggestion.term
        : cardDisplayName(activeSuggestion.card.name, activeSuggestion.card)
    : value;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      if (suggestionCount === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestionCount);
    } else if (e.key === "ArrowUp") {
      if (suggestionCount === 0) return;
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestionCount - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === "Enter" && activeSuggestion) {
      e.preventDefault();
      const newTab = e.metaKey || e.ctrlKey || e.shiftKey;
      if (activeSuggestion.kind === "card") activateCardLike(activeSuggestion.card, activeSuggestion.rank, "card", newTab);
      else if (activeSuggestion.kind === "trending") activateCardLike(activeSuggestion.card, activeSuggestion.rank, "trending", newTab);
      else if (activeSuggestion.kind === "sealed") activateSealed(activeSuggestion.sealed, activeSuggestion.rank, newTab);
      else {
        gaEvent("search_suggestion_selected", { suggestion_rank: activeSuggestion.rank, result_type: "recent", query: activeSuggestion.term, variant });
        commitSearch(activeSuggestion.term, { newTab });
      }
    }
    // Enter with no active suggestion falls through to the form's own
    // onSubmit (native behavior) — commitSearch(value) via submit() above.
  }

  const isHero = variant === "hero";
  // The active (arrowed-to) row gets a ring on top of the same background a
  // mouse hover would give it — Baymard flagged the absence of a visible
  // active-suggestion highlight as a real, measured source of hesitation and
  // mis-selection, so this needs to read as distinct, not just "hovered".
  const rowCls = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 ${active ? "bg-ink-800 ring-1 ring-inset ring-brand-500/50" : "hover:bg-ink-800"}`;

  return (
    // data-primary-cta: the audit script's (scripts/homepage-audit.mjs)
    // selector for "the page's one primary above-the-fold action" — per the
    // redesign brief, that's the hero search box itself, not a button, so it
    // needs an explicit marker rather than a `.btn-primary`-style class this
    // component was never going to have. Only the hero instance carries it;
    // the nav variant is a secondary, always-available convenience, not THE
    // primary CTA (there can be only one, and it moves to the hero the moment
    // the hero is on screen — see HeaderSearchSlot for the desktop scroll gate
    // that keeps the two from ever both claiming the role at once).
    <div ref={boxRef} data-primary-cta={isHero ? "true" : undefined} className={`relative ${isHero ? "mx-auto w-full max-w-2xl" : "max-w-xl"}`}>
      <form onSubmit={submit}>
        <svg
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-500 ${
            isHero ? "left-4 h-5 w-5" : "left-3 h-4 w-4"
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={displayValue}
          onChange={(e) => {
            const next = e.target.value;
            setActiveIndex(-1);
            if (next.length > 0) {
              clearFocusIntentTimer();
              markInitiated("keystroke");
            }
            setValue(next);
            setOpen(true);
          }}
          onFocus={() => {
            // Consume the one-shot flag the autoFocusDesktop effect set right
            // before calling .focus() itself — that focus is the app putting
            // the cursor somewhere useful, not a visitor asking to browse the
            // zero-state dropdown, and it isn't evidence of search intent
            // either (a visitor who hasn't done anything yet gets "focus_dwell"
            // for free after 1200ms of simply not having typed, which isn't
            // what that event is supposed to mean). Any focus after this one —
            // a real click, a real Tab back into the box — is untouched.
            if (suppressNextFocusOpenRef.current) {
              suppressNextFocusOpenRef.current = false;
              return;
            }
            setOpen(true);
            // Pick up anything saved by another SearchBar instance (or this
            // one, on a prior visit) since the last time this mounted.
            if (value.trim().length < 2) setRecentSearches(loadRecentSearches());
            if (!initiatedRef.current && focusIntentTimerRef.current == null) {
              focusIntentTimerRef.current = setTimeout(() => {
                focusIntentTimerRef.current = null;
                markInitiated("focus_dwell");
              }, FOCUS_INTENT_MS);
            }
          }}
          onBlur={clearFocusIntentTimer}
          onKeyDown={onKeyDown}
          placeholder={isHero ? "Search any Riftbound card…" : "Search cards, champions, sets…"}
          className={isHero ? "input border-ink-600 bg-ink-900 py-3.5 pl-11 text-base shadow-glow sm:pr-9 sm:text-lg" : "input pl-9 sm:pr-8"}
          aria-label="Search cards"
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeSuggestion ? optionId(activeIndex) : undefined}
        />
        {/* "/" shortcut hint — visible only while the field is empty (whether
            focused or not), so it doubles as an idle-state affordance and
            never collides with typed text. Decorative only: the actual
            listener is the document-level keydown effect above, not a click
            handler on this badge, so it's aria-hidden and doesn't count
            against the page's interactive-target budget. Hidden below `sm`
            — a touch keyboard has no physical "/" key worth advertising. */}
        {value.length === 0 && (
          <kbd
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 hidden -translate-y-1/2 items-center justify-center rounded border border-ink-700 bg-ink-900 font-mono text-slate-500 sm:flex ${
              isHero ? "right-4 h-6 min-w-[1.5rem] px-1.5 text-xs" : "right-3 h-5 min-w-[1.25rem] px-1 text-[10px]"
            }`}
          >
            /
          </kbd>
        )}
      </form>

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
          {isZeroState ? (
            <ul id={listboxId} role="listbox" aria-label="Search suggestions" className="py-1">
              {visibleTrending.length > 0 && (
                <li className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500" role="presentation">
                  Trending
                </li>
              )}
              {visibleTrending.map((c, i) => {
                const active = activeIndex === i;
                return (
                  <li key={`trend-${c.id}`} role="presentation">
                    <Link
                      id={optionId(i)}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      href={cardHref(c)}
                      prefetch={false}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                          trackCardView(c);
                          gaEvent("search_suggestion_selected", { suggestion_rank: i + 1, result_type: "trending", query: trimmed, card_id: c.id, variant });
                          return;
                        }
                        e.preventDefault();
                        activateCardLike(c, i + 1, "trending", false);
                      }}
                      className={rowCls(active)}
                    >
                      <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
                        {c.imageThumbUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.imageThumbUrl} alt={cardImageAlt(c)} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{cardDisplayName(c.name, c)}</div>
                        <div className="text-xs text-slate-500">
                          {c.setCode} · {c.collectorNumber}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-accent">{price(c) != null ? fmt(price(c)!) : "—"}</div>
                    </Link>
                  </li>
                );
              })}
              {visibleRecent.length > 0 && (
                <li className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500" role="presentation">
                  Recent searches
                </li>
              )}
              {visibleRecent.map((term, i) => {
                const idx = visibleTrending.length + i;
                const active = activeIndex === idx;
                return (
                  <li key={`recent-${term}`} role="presentation">
                    <button
                      type="button"
                      id={optionId(idx)}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      onClick={() => {
                        gaEvent("search_suggestion_selected", { suggestion_rank: idx + 1, result_type: "recent", query: term, variant });
                        commitSearch(term);
                      }}
                      className={`w-full text-left ${rowCls(active)}`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-900 text-slate-500">
                        <RecentIcon />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{term}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : results.length === 0 && sealed.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              {loading ? "Searching…" : "No matches — press Enter to search anyway."}
            </div>
          ) : (
            <ul id={listboxId} role="listbox" aria-label="Search suggestions" className="py-1">
              {visibleResults.map((r, i) => {
                const active = activeIndex === i;
                return (
                  <li key={r.id} role="presentation">
                    <Link
                      id={optionId(i)}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      href={cardHref(r)}
                      prefetch={false}
                      onClick={(e) => {
                        // A search-result click is the key demand signal (drives eBay
                        // priority) — record it however they open the card.
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                          trackCardView(r);
                          gaEvent("search_suggestion_selected", { suggestion_rank: i + 1, result_type: "card", query: trimmed, card_id: r.id, variant });
                          return;
                        }
                        e.preventDefault();
                        activateCardLike(r, i + 1, "card", false);
                      }}
                      className={rowCls(active)}
                    >
                      <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
                        {r.imageThumbUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.imageThumbUrl} alt={cardImageAlt(r)} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          <HighlightedLabel label={cardDisplayName(r.name, r)} query={trimmed} />
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.setCode} · {r.collectorNumber}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-accent">
                        {price(r) != null ? fmt(price(r)!) : "—"}
                      </div>
                    </Link>
                  </li>
                );
              })}
              {visibleSealed.length > 0 && (
                <>
                  <li className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500" role="presentation">
                    Sealed products
                  </li>
                  {visibleSealed.map((s, i) => {
                    const idx = visibleResults.length + i;
                    const active = activeIndex === idx;
                    return (
                      <li key={s.groupKey} role="presentation">
                        <Link
                          id={optionId(idx)}
                          role="option"
                          aria-selected={active}
                          tabIndex={-1}
                          href={`/sealed?q=${encodeURIComponent(s.name)}`}
                          onClick={() => {
                            // Continues the card list's rank rather than restarting
                            // at 1 — see the comment on the card suggestions above.
                            gaEvent("search_suggestion_selected", { suggestion_rank: idx + 1, result_type: "sealed", query: trimmed, variant });
                            setOpen(false);
                            setActiveIndex(-1);
                          }}
                          className={rowCls(active)}
                        >
                          <div className="grid h-12 w-9 shrink-0 place-items-center overflow-hidden rounded bg-ink-900">
                            {s.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.imageUrl} alt="" aria-hidden="true" className="h-full w-full object-contain" loading="lazy" decoding="async" />
                            ) : (
                              <span className="text-[8px] font-semibold text-slate-600">SEALED</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-white">
                              <HighlightedLabel label={s.name} query={trimmed} />
                            </div>
                            <div className="text-xs text-slate-500">
                              {s.productType}{s.setCode ? ` · ${s.setCode}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-sm font-bold text-accent">
                            {s.lowestPriceCents != null ? fmt(s.lowestPriceCents) : "—"}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </>
              )}

              <li className="border-t border-ink-800" role="presentation">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submit(e as unknown as React.FormEvent);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-brand-400 hover:bg-ink-800"
                >
                  See all results for “{trimmed}” →
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
