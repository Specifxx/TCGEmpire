"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatAUD } from "@/lib/format";

export type ForumKind = "WTB" | "WTS" | "DISCUSSION";

export interface ForumItem {
  name: string;
  setCode: string | null;
  condition: string | null;
  qty: number;
  marketCents: number | null;
}

export interface ForumPostDTO {
  id: string;
  kind: ForumKind;
  title: string;
  cardName: string | null;
  setCode: string | null;
  condition: string | null;
  priceCents: number | null;
  items: ForumItem[] | null;
  marketCents: number | null;
  body: string;
  contact: string;
  authorName: string;
  userId: string | null;
  score: number;
  createdAt: string; // ISO
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG", "Any"];
const VOTES_KEY = "rc_forum_votes";

const KIND_LABEL: Record<ForumKind, string> = { WTB: "Want to buy", WTS: "Want to sell", DISCUSSION: "Discussion" };
const KIND_BADGE: Record<ForumKind, string> = {
  WTB: "bg-emerald-500/15 text-emerald-300",
  WTS: "bg-gold/15 text-gold",
  DISCUSSION: "bg-sky-500/15 text-sky-300",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

interface SearchResult {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  lowestPriceCents: number | null;
}

// Autocomplete that adds a real DB card (with its live market price) to the list.
function CardPicker({ onAdd }: { onAdd: (it: ForumItem) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setResults((data.results ?? []).slice(0, 8));
      } catch {
        /* ignore */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Add a card — type to search…"
        className="input"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink-700 bg-ink-850 shadow-2xl">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onAdd({ name: r.name, setCode: r.setCode, condition: "NM", qty: 1, marketCents: r.lowestPriceCents ?? null });
                  setQ(""); setResults([]); setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-800"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {r.name} <span className="text-xs text-slate-500">{r.setCode} {r.collectorNumber}</span>
                </span>
                <span className="shrink-0 text-xs text-accent">
                  {r.lowestPriceCents != null ? formatAUD(r.lowestPriceCents) : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const emptyForm = { kind: "WTS" as ForumKind, title: "", price: "", body: "", contact: "", website: "" };

export function ForumBoard({
  initialPosts,
  currentUser,
}: {
  initialPosts: ForumPostDTO[];
  currentUser: { id: string; name: string } | null;
}) {
  const [posts, setPosts] = useState<ForumPostDTO[]>(initialPosts);
  const [filter, setFilter] = useState<"all" | ForumKind>("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [items, setItems] = useState<ForumItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});

  useEffect(() => {
    try { setVotes(JSON.parse(localStorage.getItem(VOTES_KEY) || "{}")); } catch { /* ignore */ }
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.kind === filter)),
    [posts, filter]
  );

  const isDiscussion = form.kind === "DISCUSSION";
  const recommendedCents = items.reduce((s, it) => s + (it.marketCents ?? 0) * it.qty, 0);
  const totalQty = items.reduce((s, it) => s + it.qty, 0);

  function updateItem(idx: number, patch: Partial<ForumItem>) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem(it: ForumItem) {
    setItems((arr) => [...arr, it]);
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  function persistVotes(next: Record<string, 1 | -1>) {
    setVotes(next);
    try { localStorage.setItem(VOTES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  async function vote(id: string, dir: 1 | -1) {
    const current = votes[id] ?? 0;
    const target = current === dir ? 0 : dir;
    const delta = target - current;
    if (delta === 0) return;
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, score: p.score + delta } : p)));
    const nextVotes = { ...votes };
    if (target === 0) delete nextVotes[id];
    else nextVotes[id] = target;
    persistVotes(nextVotes);
    try {
      const res = await fetch(`/api/forum/${id}/vote?delta=${delta}`, { method: "POST" });
      const data = await res.json();
      if (typeof data.score === "number") setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, score: data.score } : p)));
    } catch { /* keep optimistic */ }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          items: isDiscussion ? [] : items.map((i) => ({ name: i.name, setCode: i.setCode, condition: i.condition, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else if (data.post) {
        setPosts((ps) => [data.post as ForumPostDTO, ...ps]);
        setForm({ ...emptyForm });
        setItems([]);
        setShowForm(false);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Market Forum</h1>
          <p className="mt-1 text-sm text-slate-400">
            Buy, sell and talk Riftbound with other Australian players. List several cards in one post
            and trade directly — grab a bundle from one seller and save on postage.
          </p>
        </div>
        {currentUser ? (
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary shrink-0">
            {showForm ? "Close" : "+ New post"}
          </button>
        ) : (
          <Link href="/login?next=/forum" className="btn-primary shrink-0">Log in to post</Link>
        )}
      </div>

      {showForm && (
        <form onSubmit={submit} className="card-surface mb-6 space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {(["WTB", "WTS", "DISCUSSION"] as const).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setForm((f) => ({ ...f, kind: k }))}
                className={`chip font-semibold ${form.kind === k ? KIND_BADGE[k] + " ring-1 ring-white/15" : "bg-ink-800 text-slate-400"}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <input
            value={form.title}
            onChange={set("title")}
            placeholder={isDiscussion ? "Title — e.g. Best budget Calm deck?" : "Title — e.g. Selling my Origins doubles"}
            className="input"
            maxLength={140}
          />

          {!isDiscussion && (
            <div className="space-y-2 rounded-lg border border-ink-700 bg-ink-900/50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Cards in this listing
              </div>
              <CardPicker onAdd={addItem} />

              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 p-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">
                          {it.name} <span className="text-xs text-slate-500">{it.setCode ?? ""}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {it.marketCents != null ? `${formatAUD(it.marketCents)} market ea` : "no market price"}
                        </div>
                      </div>
                      <select
                        value={it.condition ?? "NM"}
                        onChange={(e) => updateItem(idx, { condition: e.target.value })}
                        className="input w-[4.5rem] px-1 py-1 text-xs"
                      >
                        {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => updateItem(idx, { qty: Math.max(1, it.qty - 1) })} className="grid h-6 w-6 place-items-center rounded bg-ink-800 text-slate-300 hover:bg-ink-700">−</button>
                        <span className="w-5 text-center text-sm text-white">{it.qty}</span>
                        <button type="button" onClick={() => updateItem(idx, { qty: Math.min(99, it.qty + 1) })} className="grid h-6 w-6 place-items-center rounded bg-ink-800 text-slate-300 hover:bg-ink-700">+</button>
                      </div>
                      <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className="px-1 text-slate-500 hover:text-rose-400">✕</button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 text-sm">
                    <span className="text-slate-400">Recommended total · {totalQty} {totalQty === 1 ? "card" : "cards"}</span>
                    <span className="font-bold text-accent">{formatAUD(recommendedCents)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Based on current lowest market prices — a guide for pricing the bundle.
                  </p>
                </div>
              )}
            </div>
          )}

          {!isDiscussion && (
            <input
              value={form.price}
              onChange={set("price")}
              placeholder="Your asking price for the lot A$ (optional)"
              inputMode="decimal"
              className="input"
            />
          )}

          <textarea
            value={form.body}
            onChange={set("body")}
            placeholder={isDiscussion ? "What's on your mind?" : "Details — condition notes, location, postage, combined-postage offers, etc."}
            className="input min-h-[90px]"
            maxLength={4000}
          />

          {!isDiscussion && (
            <input
              value={form.contact}
              onChange={set("contact")}
              placeholder="Contact — email or Discord (shown publicly)"
              className="input"
              maxLength={160}
            />
          )}

          {/* Honeypot */}
          <input value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              Posting as <span className="text-slate-300">{currentUser?.name}</span>. Never share passwords or financial details.
            </p>
            <button type="submit" disabled={submitting} className="btn-primary shrink-0 disabled:opacity-50">
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["all", "All"],
          ["WTB", "Want to buy"],
          ["WTS", "Want to sell"],
          ["DISCUSSION", "Discussion"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`chip font-semibold ${filter === k ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "bg-ink-800 text-slate-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No posts yet</p>
            <p className="mt-1 text-sm">Be the first to post.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => {
            const v = votes[p.id] ?? 0;
            return (
              <li key={p.id} className="card-surface flex overflow-hidden">
                <div className="flex w-12 shrink-0 flex-col items-center justify-start gap-0.5 bg-ink-900/50 py-3">
                  <button onClick={() => vote(p.id, 1)} aria-label="Upvote" className={`grid h-6 w-6 place-items-center rounded hover:bg-ink-800 ${v === 1 ? "text-brand-400" : "text-slate-500"}`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  </button>
                  <span className={`text-sm font-bold ${v === 1 ? "text-brand-400" : v === -1 ? "text-rose-400" : "text-slate-300"}`}>{p.score}</span>
                  <button onClick={() => vote(p.id, -1)} aria-label="Downvote" className={`grid h-6 w-6 place-items-center rounded hover:bg-ink-800 ${v === -1 ? "text-rose-400" : "text-slate-500"}`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                  </button>
                </div>

                <div className="min-w-0 flex-1 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`chip font-bold ${KIND_BADGE[p.kind]}`}>
                      {p.kind === "DISCUSSION" ? "DISCUSSION" : p.kind === "WTB" ? "WANT TO BUY" : "WANT TO SELL"}
                    </span>
                    {p.priceCents != null && <span className="chip bg-ink-800 font-bold text-accent">{formatAUD(p.priceCents)} asking</span>}
                    {p.priceCents == null && p.marketCents != null && (
                      <span className="chip bg-ink-800 font-bold text-accent">≈ {formatAUD(p.marketCents)} market</span>
                    )}
                  </div>

                  <h2 className="mt-2 font-bold text-white">{p.title}</h2>

                  {p.items && p.items.length > 0 && (
                    <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900/40 p-2">
                      <ul className="divide-y divide-ink-800/70">
                        {p.items.map((it, i) => (
                          <li key={i} className="flex items-center gap-2 py-1 text-sm">
                            <span className="w-7 shrink-0 text-slate-500">{it.qty}×</span>
                            <span className="min-w-0 flex-1 truncate text-slate-200">
                              {it.name}
                              {it.condition && it.condition !== "Any" ? <span className="text-xs text-slate-500"> · {it.condition}</span> : null}
                            </span>
                            <span className="shrink-0 text-xs text-slate-400">{it.marketCents != null ? formatAUD(it.marketCents) : "—"}</span>
                          </li>
                        ))}
                      </ul>
                      {p.marketCents != null && (
                        <div className="mt-1 flex items-center justify-between border-t border-ink-800 px-1 pt-1 text-xs">
                          <span className="text-slate-500">Recommended (market) total</span>
                          <span className="font-bold text-accent">{formatAUD(p.marketCents)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {p.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{p.body}</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {p.userId ? (
                      <Link href={`/forum/seller/${p.userId}`} className="font-medium text-brand-400 hover:underline">{p.authorName}</Link>
                    ) : (
                      <span className="font-medium text-slate-400">{p.authorName}</span>
                    )}
                    <span>·</span>
                    <span>{timeAgo(p.createdAt)}</span>
                    {p.contact && (
                      <>
                        <span>·</span>
                        <span>Contact: <span className="text-slate-300">{p.contact}</span></span>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-600">
        RiftCompareAU hosts these community listings but is not a party to any trade. Deal carefully and meet/pay safely.
      </p>
    </div>
  );
}
