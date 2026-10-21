"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCountry } from "@/components/CountryProvider";
import { trackEvent } from "@/lib/analytics";
import {
  addCard,
  autoRunes,
  championKey,
  copiesOf,
  COPY_LIMIT,
  deckDomains,
  deckPrice,
  deckToText,
  defaultZone,
  emptyDeck,
  energyCurve,
  MAIN_DECK_TOTAL,
  moveCard,
  normaliseShareCode,
  OPENING_HAND,
  recommend,
  removeCard,
  SIDE_MAX,
  textToDeck,
  validateDeck,
  zoneCount,
  ZONE_LABEL,
  ZONES,
  type BuilderCard,
  type DeckZones,
  type Zone,
} from "@/lib/deck-builder";

// THE VISUAL DECK BUILDER (2026-10-21; lib/deck-builder.ts has the rules).
// Browse every card on the left, build on the right: click to add, shift-click
// for the side deck, drag between zones, hover for a big preview. Rules are
// checked live, the deck saves in this browser, and a six-character code shares
// it (riftcompare.com/d/CODE). Free, no account.

const TYPES = ["Legend", "Unit", "Spell", "Gear", "Rune", "Battlefield"] as const;
const DOMAINS = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order", "Colorless"] as const;
const DOMAIN_COLOR: Record<string, string> = {
  Fury: "bg-red-500/20 text-red-300 border-red-500/40",
  Calm: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  Mind: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  Body: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  Chaos: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40",
  Order: "bg-yellow-500/20 text-yellow-200 border-yellow-500/40",
  Colorless: "bg-slate-500/20 text-slate-300 border-slate-500/40",
};
const PAGE = 60;
const DRAFT_KEY = "rc_deckbuilder_draft";
const SAVED_KEY = "rc_deckbuilder_saved";

interface SavedDeck {
  name: string;
  list: string;
  updated: number;
}

function readSaved(): SavedDeck[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((d) => d && typeof d.name === "string" && typeof d.list === "string") : [];
  } catch {
    return [];
  }
}
function writeSaved(list: SavedDeck[]) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage blocked: saving is best-effort */
  }
}
function b64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

export function VisualDeckBuilder({ initialList, initialTitle, sharedCode }: { initialList?: string; initialTitle?: string | null; sharedCode?: string }) {
  const { country, fmt } = useCountry();
  const [catalog, setCatalog] = useState<BuilderCard[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [deck, setDeck] = useState<DeckZones>(emptyDeck);
  const [history, setHistory] = useState<DeckZones[]>([]);
  const [name, setName] = useState(initialTitle ?? "");
  const [toast, setToast] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ card: BuilderCard; x: number; y: number } | null>(null);
  const [mobileTab, setMobileTab] = useState<"cards" | "deck">("cards");
  // Filters
  const [q, setQ] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [set, setSet] = useState<string>("");
  const [fits, setFits] = useState(false);
  const [sort, setSort] = useState<"popular" | "name" | "cost" | "price">("popular");
  const [shown, setShown] = useState(PAGE);
  // Panels
  const [hand, setHand] = useState<BuilderCard[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [saved, setSaved] = useState<SavedDeck[]>([]);
  const [share, setShare] = useState<{ code: string; busy: boolean; error?: string } | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const loaded = useRef(false);

  const byId = useMemo(() => new Map((catalog ?? []).map((c) => [c.id, c])), [catalog]);
  const market = (country as keyof BuilderCard["price"]) ?? "AU";

  useEffect(() => {
    fetch("/api/deck-builder/cards")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { cards: BuilderCard[] }) => setCatalog(d.cards))
      .catch(() => setLoadError(true));
    setSaved(readSaved());
    trackEvent("deck_builder_open", { shared: !!sharedCode });
  }, [sharedCode]);

  // First load: a shared deck, else this browser's draft.
  useEffect(() => {
    if (!catalog || loaded.current) return;
    loaded.current = true;
    let text = initialList ?? "";
    if (!text) {
      try {
        const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
        if (draft && typeof draft.list === "string") {
          text = draft.list;
          if (typeof draft.name === "string") setName(draft.name);
        }
      } catch {
        /* no draft */
      }
    }
    if (text) {
      const r = textToDeck(text, catalog);
      setDeck(r.deck);
      setUnmatched(r.unmatched);
    }
  }, [catalog, initialList]);

  // Autosave the draft.
  useEffect(() => {
    if (!catalog || !loaded.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ list: deckToText(deck, byId), name }));
    } catch {
      /* best-effort */
    }
  }, [deck, name, catalog, byId]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const commit = useCallback(
    (next: DeckZones) => {
      setHistory((h) => [...h.slice(-49), deck]);
      setDeck(next);
    },
    [deck],
  );

  const add = useCallback(
    (card: BuilderCard, zone?: Zone) => {
      const z = zone ?? defaultZone(card, deck, byId);
      const r = addCard(deck, card, z, byId);
      if (r.refused) return flash(r.refused);
      commit(r.deck);
      trackEvent("deck_builder_add", { zone: z, type: card.type });
    },
    [deck, byId, commit, flash],
  );
  const remove = useCallback((card: BuilderCard, zone: Zone) => commit(removeCard(deck, card.id, zone)), [deck, commit]);
  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      setDeck(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  // ── Drag and drop ──────────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, card: BuilderCard, from: Zone | null) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: card.id, from }));
    e.dataTransfer.effectAllowed = "move";
    setPreview(null);
  };
  const readDrag = (e: React.DragEvent): { card: BuilderCard; from: Zone | null } | null => {
    try {
      const d = JSON.parse(e.dataTransfer.getData("text/plain"));
      const card = byId.get(d.id);
      return card ? { card, from: d.from ?? null } : null;
    } catch {
      return null;
    }
  };
  const dropOnZone = (e: React.DragEvent, zone: Zone) => {
    e.preventDefault();
    const d = readDrag(e);
    if (!d) return;
    if (d.from) {
      const r = moveCard(deck, d.card, d.from, zone, byId);
      if (r.refused) return flash(r.refused);
      commit(r.deck);
    } else add(d.card, zone);
  };
  const dropOnBrowser = (e: React.DragEvent) => {
    e.preventDefault();
    const d = readDrag(e);
    if (d?.from) remove(d.card, d.from);
  };

  // ── Hover preview ───────────────────────────────────────────────────────────
  const hover = (card: BuilderCard) => (e: React.MouseEvent) => {
    if (window.matchMedia("(hover: none)").matches) return;
    setPreview({ card, x: e.clientX, y: e.clientY });
  };
  const unhover = () => setPreview(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const legendId = Object.keys(deck.legend)[0];
  const legend = legendId ? byId.get(legendId) : undefined;
  const doms = useMemo(() => deckDomains(deck, byId), [deck, byId]);
  const issues = useMemo(() => (catalog ? validateDeck(deck, byId) : []), [deck, byId, catalog]);
  const errors = issues.filter((i) => i.level === "error");
  const curve = useMemo(() => energyCurve(deck, byId), [deck, byId]);
  const price = useMemo(() => deckPrice(deck, byId, market), [deck, byId, market]);
  const recs = useMemo(() => (catalog ? recommend(deck, catalog, byId, 8) : []), [deck, catalog, byId]);
  const sets = useMemo(() => [...new Set((catalog ?? []).map((c) => c.setCode))].sort(), [catalog]);
  const mainCount = zoneCount(deck, "main") + zoneCount(deck, "champion");
  const typeCounts = useMemo(() => {
    const t: Record<string, number> = {};
    for (const z of ["main", "champion"] as Zone[]) for (const [id, n] of Object.entries(deck[z])) {
      const c = byId.get(id);
      if (c) t[c.type] = (t[c.type] ?? 0) + n;
    }
    return t;
  }, [deck, byId]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const needle = q.trim().toLowerCase();
    const fitDoms = doms.length ? doms.slice(0, 2) : legend?.domain ? [legend.domain] : [];
    const list = catalog.filter(
      (c) =>
        (!needle || c.name.toLowerCase().includes(needle)) &&
        (!type || c.type === type) &&
        (!domain || c.domain === domain) &&
        (cost == null || (cost === 7 ? (c.energyCost ?? -1) >= 7 : c.energyCost === cost)) &&
        (!set || c.setCode === set) &&
        (!fits || !fitDoms.length || c.domain === "Colorless" || (c.domain != null && fitDoms.includes(c.domain)) || c.type === "Legend"),
    );
    const p = (c: BuilderCard) => c.price[market] ?? Number.MAX_SAFE_INTEGER;
    list.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : sort === "cost" ? (a.energyCost ?? 99) - (b.energyCost ?? 99) || a.name.localeCompare(b.name) : sort === "price" ? p(a) - p(b) : b.pop - a.pop,
    );
    return list;
  }, [catalog, q, type, domain, cost, set, fits, sort, market, doms, legend]);

  useEffect(() => setShown(PAGE), [q, type, domain, cost, set, fits, sort]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const deckText = catalog ? deckToText(deck, byId) : "";
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(deckText);
      flash("Deck list copied");
    } catch {
      flash("Couldn't copy — select the text in Import / export");
    }
  };
  const doImport = () => {
    if (!catalog) return;
    const r = textToDeck(importText, catalog);
    commit(r.deck);
    setUnmatched(r.unmatched);
    setImportOpen(false);
    flash(r.unmatched.length ? `Imported — ${r.unmatched.length} line(s) not matched` : "Deck imported");
    trackEvent("deck_builder_import", { unmatched: r.unmatched.length });
  };
  const saveDeck = () => {
    const nm = (name || legend?.name || "My deck").slice(0, 60);
    const list = readSaved().filter((d) => d.name !== nm);
    const next = [{ name: nm, list: deckText, updated: Date.now() }, ...list];
    writeSaved(next);
    setSaved(next);
    setName(nm);
    flash(`Saved “${nm}” in this browser`);
    trackEvent("deck_builder_save");
  };
  const loadDeck = (d: SavedDeck) => {
    if (!catalog) return;
    const r = textToDeck(d.list, catalog);
    commit(r.deck);
    setName(d.name);
    setUnmatched(r.unmatched);
  };
  const deleteSaved = (d: SavedDeck) => {
    const next = readSaved().filter((x) => x.name !== d.name);
    writeSaved(next);
    setSaved(next);
  };
  const doShare = async () => {
    if (!deckText) return flash("Add some cards first");
    setShare({ code: "", busy: true });
    try {
      const res = await fetch("/api/deck-builder/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: deckText, title: name || legend?.name || null }),
      });
      const d = await res.json();
      if (!res.ok || !d.code) throw new Error(d.error ?? "Couldn't share");
      setShare({ code: d.code, busy: false });
      trackEvent("deck_builder_share");
    } catch (e) {
      setShare({ code: "", busy: false, error: (e as Error).message });
    }
  };
  const openCode = async () => {
    const code = normaliseShareCode(codeInput);
    if (!code) return flash("A deck code is 6 letters and numbers");
    const res = await fetch(`/api/deck-builder/share?code=${code}`);
    if (!res.ok) return flash("No deck has that code");
    const d = await res.json();
    if (!catalog) return;
    const r = textToDeck(d.list, catalog);
    commit(r.deck);
    setName(d.title ?? "");
    setUnmatched(r.unmatched);
    setCodeInput("");
    flash(`Opened deck ${code}`);
  };
  const drawHand = () => {
    const pool: BuilderCard[] = [];
    for (const [id, n] of Object.entries(deck.main)) {
      const c = byId.get(id);
      if (c) for (let i = 0; i < n; i++) pool.push(c);
    }
    if (pool.length < OPENING_HAND) return flash(`Add at least ${OPENING_HAND} main-deck cards first`);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setHand(pool.slice(0, OPENING_HAND));
    trackEvent("deck_builder_hand");
  };

  if (loadError) return <p className="card-surface p-6 text-sm text-slate-300">The card list didn&apos;t load. Refresh the page to try again.</p>;
  if (!catalog) {
    return (
      <div className="card-surface flex min-h-[420px] items-center justify-center p-6 text-sm text-slate-400" aria-busy="true">
        Loading every Riftbound card…
      </div>
    );
  }

  const championCandidates = legend ? championKey(legend.name) : null;

  return (
    <div className="relative">
      {/* Phone: one panel at a time. */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1 lg:hidden" role="tablist">
        {(["cards", "deck"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={mobileTab === t}
            onClick={() => setMobileTab(t)}
            className={`min-h-11 rounded-lg text-sm font-bold ${mobileTab === t ? "bg-ink-700 text-white" : "text-slate-400"}`}
          >
            {t === "cards" ? "Cards" : `Deck · ${mainCount}/${MAIN_DECK_TOTAL}`}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* ── CARD BROWSER ── */}
        <section
          aria-label="Card browser"
          className={`${mobileTab === "cards" ? "" : "hidden"} min-w-0 lg:block`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={dropOnBrowser}
        >
          <div className="card-surface space-y-3 p-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cards by name…"
              className="input w-full"
              aria-label="Search the card browser"
            />
            <div className="flex flex-wrap gap-1.5">
              <Chip on={!type} onClick={() => setType(null)}>All</Chip>
              {TYPES.map((t) => (
                <Chip key={t} on={type === t} onClick={() => setType(type === t ? null : t)}>
                  {t}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DOMAINS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDomain(domain === d ? null : d)}
                  className={`min-h-8 rounded-full border px-2.5 text-xs font-semibold ${domain === d ? DOMAIN_COLOR[d] : "border-ink-700 text-slate-400 hover:text-white"}`}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500">Cost</span>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  onClick={() => setCost(cost === n ? null : n)}
                  className={`h-8 w-8 rounded-full border font-bold ${cost === n ? "border-brand-400 bg-brand-500/20 text-white" : "border-ink-700 text-slate-400"}`}
                >
                  {n === 7 ? "7+" : n}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select value={set} onChange={(e) => setSet(e.target.value)} className="input h-9 w-auto py-0 text-xs" aria-label="Set">
                <option value="">All sets</option>
                {sets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input h-9 w-auto py-0 text-xs" aria-label="Sort">
                <option value="popular">Most popular</option>
                <option value="name">Name</option>
                <option value="cost">Energy cost</option>
                <option value="price">Cheapest</option>
              </select>
              <label className="flex min-h-9 items-center gap-1.5 text-slate-300">
                <input type="checkbox" checked={fits} onChange={(e) => setFits(e.target.checked)} /> Fits my domains
              </label>
              <span className="ml-auto text-slate-500">{filtered.length} cards</span>
            </div>
          </div>

          <p className="mt-2 hidden text-[11px] text-slate-500 lg:block">
            Click to add · Shift-click for the side deck · Drag onto a zone · Drag a deck card back here to remove it · Hover to preview
          </p>

          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
            {filtered.slice(0, shown).map((c) => {
              const inDeck = ZONES.reduce((n, z) => n + (deck[z][c.id] ?? 0), 0);
              const champ = championCandidates && c.type === "Unit" && championKey(c.name) === championCandidates;
              const maxed = (c.type === "Unit" || c.type === "Spell" || c.type === "Gear") && copiesOf(c.name, deck, byId) >= COPY_LIMIT;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => onDragStart(e, c, null)}
                    onClick={(e) => add(c, e.shiftKey ? "side" : undefined)}
                    onMouseMove={hover(c)}
                    onMouseLeave={unhover}
                    className={`group relative block w-full overflow-hidden rounded-lg border text-left transition hover:-translate-y-0.5 hover:border-brand-400 ${champ ? "border-gold ring-2 ring-gold/40" : "border-ink-700"} ${maxed ? "opacity-50" : ""}`}
                    aria-label={`Add ${c.name}`}
                  >
                    <CardImg card={c} />
                    {inDeck > 0 && (
                      <span className="absolute right-1 top-1 rounded-full bg-brand-500 px-1.5 text-[11px] font-black text-white shadow">×{inDeck}</span>
                    )}
                    {champ && <span className="absolute left-1 top-1 rounded bg-gold px-1 text-[9px] font-black uppercase text-ink-950">Champion</span>}
                    <span className="block truncate px-1.5 py-1 text-[11px] font-semibold text-slate-200">{c.name}</span>
                    <span className="flex items-center justify-between px-1.5 pb-1 text-[10px] text-slate-500">
                      <span>{c.type}{c.energyCost != null ? ` · ${c.energyCost}` : ""}</span>
                      <span className="num text-slate-300">{c.price[market] != null ? fmt(c.price[market]!) : "—"}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {filtered.length > shown && (
            <button onClick={() => setShown((n) => n + PAGE)} className="btn-ghost mt-3 w-full text-sm">
              Show more ({filtered.length - shown} left)
            </button>
          )}
        </section>

        {/* ── DECK ── */}
        <aside aria-label="Your deck" className={`${mobileTab === "deck" ? "" : "hidden"} lg:block`}>
          <div className="space-y-3 lg:sticky lg:top-20">
            <div className="card-surface p-3">
              <div className="flex items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 60))}
                  placeholder={legend ? legend.name : "Name your deck"}
                  className="input min-w-0 flex-1 text-sm font-bold"
                  aria-label="Deck name"
                />
                <button onClick={undo} disabled={!history.length} className="btn-ghost px-3 text-xs" title="Undo">
                  ↶ Undo
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                {errors.length === 0 ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">✓ Tournament-legal</span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-300">{errors.length} to fix</span>
                )}
                {doms.map((d) => (
                  <span key={d} className={`rounded-full border px-2 py-0.5 font-semibold ${DOMAIN_COLOR[d] ?? ""}`}>
                    {d}
                  </span>
                ))}
                <span className="ml-auto text-right">
                  <span className="num font-extrabold text-white">{fmt(price.cents)}</span>
                  <span className="block text-[10px] text-slate-500">
                    cheapest copies{price.missing ? ` · ${price.missing} not in stock` : ""}
                  </span>
                </span>
              </div>
            </div>

            {/* Zones */}
            <div className="card-surface divide-y divide-ink-800">
              {(["legend", "champion", "main", "runes", "battlefields", "side"] as Zone[]).map((z) => (
                <ZoneBox
                  key={z}
                  zone={z}
                  deck={deck}
                  byId={byId}
                  onDrop={(e) => dropOnZone(e, z)}
                  onDragStart={onDragStart}
                  onAdd={(c) => add(c, z)}
                  onRemove={(c) => remove(c, z)}
                  hover={hover}
                  unhover={unhover}
                  fmt={(c) => (c.price[market] != null ? fmt(c.price[market]!) : "—")}
                />
              ))}
            </div>

            {/* Rules check */}
            {issues.length > 0 && (
              <div className="card-surface p-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Rules check</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {issues.map((i) => (
                    <li key={i.text} className={i.level === "error" ? "text-amber-300" : "text-slate-400"}>
                      {i.level === "error" ? "• " : "⚠ "}
                      {i.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unmatched.length > 0 && (
              <p className="card-surface p-3 text-xs text-slate-400">
                Not matched: {unmatched.slice(0, 8).join(", ")}
                {unmatched.length > 8 ? "…" : ""}
              </p>
            )}

            {/* Stats */}
            <div className="card-surface p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Energy curve</h3>
              <div className="mt-2 flex h-24 items-end gap-1.5">
                {curve.map((n, i) => {
                  const max = Math.max(1, ...curve);
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <span className="num text-[10px] text-slate-400">{n || ""}</span>
                      <div className="w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${(n / max) * 64}px` }} />
                      <span className="text-[10px] text-slate-500">{i === 7 ? "7+" : i}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                {Object.entries(typeCounts)
                  .map(([t, n]) => `${n} ${t}${n === 1 ? "" : "s"}`)
                  .join(" · ") || "No main-deck cards yet"}
              </p>
            </div>

            {/* Tools */}
            <div className="card-surface grid grid-cols-2 gap-2 p-3 text-xs">
              <button onClick={() => commit(autoRunes(deck, catalog, byId))} className="btn-ghost">⚡ Auto-fill runes</button>
              <button onClick={drawHand} className="btn-ghost">🂠 Sample hand</button>
              <button onClick={saveDeck} className="btn-ghost">💾 Save</button>
              <button onClick={doShare} className="btn-primary">🔗 Share code</button>
              <button onClick={() => { setImportText(deckText); setImportOpen(true); }} className="btn-ghost">⇄ Import / export</button>
              <button onClick={copyText} className="btn-ghost">📋 Copy list</button>
              <Link
                href={`/tools/best-basket?list=${encodeURIComponent(b64(deckText))}`}
                onClick={() => trackEvent("deck_builder_buy")}
                className="btn-ghost col-span-2 text-center"
              >
                🛒 Find the cheapest way to buy it
              </Link>
              <button
                onClick={() => {
                  if (confirm("Clear the whole deck?")) commit(emptyDeck());
                }}
                className="col-span-2 text-center text-[11px] text-slate-500 hover:text-rose-300"
              >
                Clear deck
              </button>
            </div>

            {share && (
              <div className="card-surface border-brand-500/40 p-3 text-sm">
                {share.busy ? (
                  "Making a code…"
                ) : share.error ? (
                  <span className="text-rose-300">{share.error}</span>
                ) : (
                  <>
                    <p className="text-xs text-slate-400">Your deck code</p>
                    <p className="num text-3xl font-black tracking-[0.3em] text-white">{share.code}</p>
                    <p className="mt-1 break-all text-xs text-brand-300">riftcompare.com/d/{share.code}</p>
                    <button
                      onClick={() => navigator.clipboard?.writeText(`https://riftcompare.com/d/${share.code}`).then(() => flash("Link copied"))}
                      className="btn-ghost mt-2 w-full text-xs"
                    >
                      Copy link
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="card-surface flex gap-2 p-3">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="Have a deck code?"
                className="input min-w-0 flex-1 font-mono text-sm uppercase tracking-widest"
                aria-label="Deck code"
              />
              <button onClick={openCode} className="btn-ghost px-3 text-xs">Open</button>
            </div>

            {saved.length > 0 && (
              <div className="card-surface p-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Saved in this browser</h3>
                <ul className="mt-2 space-y-1">
                  {saved.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-sm">
                      <button onClick={() => loadDeck(d)} className="min-w-0 flex-1 truncate text-left text-slate-200 hover:text-white">
                        {d.name}
                      </button>
                      <button onClick={() => deleteSaved(d)} className="text-xs text-slate-500 hover:text-rose-300" aria-label={`Delete ${d.name}`}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Recommendations */}
      <section className="mt-6" aria-labelledby="recs">
        <h2 id="recs" className="text-lg font-extrabold text-white">
          {legend ? "Recommended next" : "Start with a Legend"}
        </h2>
        <p className="text-xs text-slate-500">
          {legend
            ? `Cards that fit ${doms.length ? doms.slice(0, 2).join(" / ") : legend.domain}, ranked by what Riftbound players look up most on RiftCompare.`
            : "Your Legend sets your domains and your Champion. These are the most looked-up Legends."}
        </p>
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {recs.map(({ card, why }) => (
            <li key={card.id}>
              <button
                onClick={() => add(card)}
                onMouseMove={hover(card)}
                onMouseLeave={unhover}
                draggable
                onDragStart={(e) => onDragStart(e, card, null)}
                className="block w-full overflow-hidden rounded-lg border border-ink-700 text-left hover:border-brand-400"
              >
                <CardImg card={card} />
                <span className="block truncate px-1.5 pt-1 text-[10px] font-semibold text-slate-200">{card.name}</span>
                <span className="block truncate px-1.5 pb-1 text-[10px] text-brand-300">{why}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Hover preview */}
      {preview && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[80] hidden w-64 overflow-hidden rounded-xl border border-ink-600 bg-ink-950 shadow-2xl shadow-black/70 lg:block"
          style={{
            left: Math.min(preview.x + 24, (typeof window !== "undefined" ? window.innerWidth : 1600) - 280),
            top: Math.max(12, Math.min(preview.y - 160, (typeof window !== "undefined" ? window.innerHeight : 900) - 440)),
          }}
        >
          {preview.card.full || preview.card.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.card.full ?? preview.card.img!} alt="" aria-hidden="true" className="block w-full" />
          ) : null}
          <div className="p-2 text-xs">
            <p className="font-bold text-white">{preview.card.name}</p>
            <p className="text-slate-400">
              {preview.card.type}
              {preview.card.domain ? ` · ${preview.card.domain}` : ""}
              {preview.card.energyCost != null ? ` · ${preview.card.energyCost} energy` : ""}
              {preview.card.might != null ? ` · ${preview.card.might} might` : ""}
            </p>
            <p className="num text-gold">{preview.card.price[market] != null ? `from ${fmt(preview.card.price[market]!)}` : "not in stock"}</p>
          </div>
        </div>
      )}

      {/* Sample hand */}
      {hand && (
        <div role="dialog" aria-label="Sample opening hand" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={() => setHand(null)}>
          <div className="card-surface w-full max-w-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-white">Your opening {OPENING_HAND}</h3>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {hand.map((c, i) => (
                <CardImg key={i} card={c} className="rounded-lg" />
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={drawHand} className="btn-primary flex-1">Draw again</button>
              <button onClick={() => setHand(null)} className="btn-ghost flex-1">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Import / export */}
      {importOpen && (
        <div role="dialog" aria-label="Import or export a deck list" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={() => setImportOpen(false)}>
          <div className="card-surface w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-extrabold text-white">Import / export</h3>
            <p className="mt-1 text-xs text-slate-400">Paste any list (“3 Card Name” per line, zone headers optional), or copy this one.</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={14} className="input mt-2 w-full font-mono text-xs" />
            <div className="mt-3 flex gap-2">
              <button onClick={doImport} className="btn-primary flex-1">Load this list</button>
              <button onClick={() => setImportOpen(false)} className="btn-ghost flex-1">Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-[95] -translate-x-1/2 rounded-full bg-ink-800 px-4 py-2 text-sm font-semibold text-white shadow-xl lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`min-h-8 rounded-full px-3 text-xs font-semibold ${on ? "bg-brand-500 text-white" : "bg-ink-800 text-slate-300 hover:bg-ink-700"}`}>
      {children}
    </button>
  );
}

function CardImg({ card, className = "" }: { card: BuilderCard; className?: string }) {
  const landscape = card.type === "Battlefield";
  return card.img ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={card.img} alt={card.name} loading="lazy" className={`block w-full bg-ink-900 object-cover ${landscape ? "aspect-[1039/744]" : "aspect-[744/1039]"} ${className}`} />
  ) : (
    <div className={`flex aspect-[744/1039] w-full items-center justify-center bg-ink-800 p-2 text-center text-[10px] text-slate-400 ${className}`}>{card.name}</div>
  );
}

function ZoneBox({
  zone,
  deck,
  byId,
  onDrop,
  onDragStart,
  onAdd,
  onRemove,
  hover,
  unhover,
  fmt,
}: {
  zone: Zone;
  deck: DeckZones;
  byId: Map<string, BuilderCard>;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, c: BuilderCard, from: Zone) => void;
  onAdd: (c: BuilderCard) => void;
  onRemove: (c: BuilderCard) => void;
  hover: (c: BuilderCard) => (e: React.MouseEvent) => void;
  unhover: () => void;
  fmt: (c: BuilderCard) => string;
}) {
  const [over, setOver] = useState(false);
  const n = zoneCount(deck, zone);
  const target = zone === "main" ? MAIN_DECK_TOTAL - 1 : zone === "side" ? SIDE_MAX : zone === "runes" ? 12 : zone === "battlefields" ? 3 : 1;
  const done = zone === "side" ? n <= SIDE_MAX : n === target;
  const entries = Object.entries(deck[zone])
    .map(([id, q]) => ({ card: byId.get(id)!, q }))
    .filter((e) => e.card)
    .sort((a, b) => (a.card.energyCost ?? 99) - (b.card.energyCost ?? 99) || a.card.name.localeCompare(b.card.name));
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e);
      }}
      className={`p-3 transition ${over ? "bg-brand-500/10" : ""}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">{ZONE_LABEL[zone]}</h3>
        <span className={`num text-xs font-bold ${done && n > 0 ? "text-emerald-300" : n > target ? "text-rose-300" : "text-slate-500"}`}>
          {n}/{target}
          {zone === "main" ? " + Champion" : ""}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-1.5 rounded-lg border border-dashed border-ink-700 p-2 text-center text-[11px] text-slate-500">
          {zone === "legend" ? "Click a Legend, or drop one here" : zone === "champion" ? "A unit of your Legend's champion" : zone === "side" ? `Shift-click or drop up to ${SIDE_MAX}` : "Drop cards here"}
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {entries.map(({ card, q }) => (
            <li
              key={card.id}
              draggable
              onDragStart={(e) => onDragStart(e, card, zone)}
              onMouseMove={hover(card)}
              onMouseLeave={unhover}
              className="group flex cursor-grab items-center gap-2 overflow-hidden rounded-md bg-ink-900 pr-1 text-xs"
            >
              {card.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.img} alt="" aria-hidden="true" className="h-9 w-14 shrink-0 object-cover object-[50%_20%]" loading="lazy" />
              ) : (
                <span className="h-9 w-14 shrink-0 bg-ink-800" />
              )}
              <span className="num w-5 shrink-0 text-center font-black text-brand-300">{card.energyCost ?? ""}</span>
              <span className="min-w-0 flex-1 truncate text-slate-200">{card.name}</span>
              <span className="num shrink-0 text-[10px] text-slate-500">{fmt(card)}</span>
              <span className="num shrink-0 font-bold text-white">×{q}</span>
              <button onClick={() => onRemove(card)} className="h-7 w-7 shrink-0 rounded bg-ink-800 font-bold text-slate-300 hover:bg-ink-700" aria-label={`Remove one ${card.name}`}>
                −
              </button>
              {zone !== "legend" && zone !== "champion" && (
                <button onClick={() => onAdd(card)} className="h-7 w-7 shrink-0 rounded bg-ink-800 font-bold text-slate-300 hover:bg-ink-700" aria-label={`Add one ${card.name}`}>
                  +
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
