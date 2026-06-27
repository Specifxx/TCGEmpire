"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { COUNTRIES, DEFAULT_COUNTRY, MARKET_COUNTRY, statesFor } from "@/lib/locations";
import { useCountry } from "./CountryProvider";
import { ForumPostModal } from "./ForumPostModal";
import { type PublicBadge } from "@/lib/points-config";

export type ForumKind = "WTB" | "WTS" | "DISCUSSION";

export interface ForumItem {
  name: string;
  setCode: string | null;
  condition: string | null;
  qty: number;
  marketCents: number | null;
}

export type ForumStatus = "OPEN" | "SOLD";

export interface ForumPostDTO {
  id: string;
  kind: ForumKind;
  status: ForumStatus;
  title: string;
  cardName: string | null;
  setCode: string | null;
  condition: string | null;
  priceCents: number | null;
  items: ForumItem[] | null;
  marketCents: number | null;
  body: string;
  contact: string;
  country: string | null;
  state: string | null;
  market: string; // "AU" | "NZ" | "US" — the region this listing belongs to
  authorName: string;
  userId: string | null;
  commentCount: number;
  createdAt: string; // ISO
}

export type AdminMarket = "AU" | "NZ" | "US" | "ALL";

// Admin-only context: region the admin is currently viewing, per-region listing
// counts, and how many synthetic seed posts exist (for the "clear" tool).
export interface ForumAdminView {
  market: AdminMarket;
  counts: { AU: number; NZ: number; US: number; total: number };
  seedCount: number;
}

const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG", "Any"];
const PER_PAGE = 10;

const KIND_LABEL: Record<ForumKind, string> = { WTB: "Want to buy", WTS: "Want to sell", DISCUSSION: "Discussion" };
const KIND_BADGE: Record<ForumKind, string> = {
  WTB: "bg-emerald-500/15 text-emerald-300",
  WTS: "bg-gold/15 text-gold",
  DISCUSSION: "bg-sky-500/15 text-sky-300",
};

// Condensed page list with ellipses, e.g. [1, "…", 4, 5, 6, "…", 12].
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push("…");
  for (let n = start; n <= end; n++) out.push(n);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

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

// Absolute date + time of a post, e.g. "6 Jun 2026, 11:30 pm".
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface SearchResult {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  lowestPriceCents: number | null;
  lowestPriceCentsNz?: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
}

// Autocomplete that adds a real DB card (with its live market price) to the list.
function CardPicker({ onAdd }: { onAdd: (it: ForumItem) => void }) {
  const { fmt, price } = useCountry();
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
                  onAdd({ name: r.name, setCode: r.setCode, condition: "NM", qty: 1, marketCents: price(r) });
                  setQ(""); setResults([]); setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-800"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {r.name} <span className="text-xs text-slate-500">{r.setCode} {r.collectorNumber}</span>
                </span>
                <span className="shrink-0 text-xs text-accent">
                  {price(r) != null ? fmt(price(r)!) : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const emptyForm = {
  kind: "WTS" as ForumKind,
  title: "",
  price: "",
  body: "",
  contact: "",
  country: DEFAULT_COUNTRY,
  state: "",
  website: "",
};

// Small author-standing chips (Shard level + equipped flair/badge) shown by names.
function AuthorBadges({ badge }: { badge?: PublicBadge }) {
  if (!badge) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {badge.badge && <span title="Badge">{badge.badge}</span>}
      <span
        className="chip px-1.5 py-0 text-[10px] font-bold leading-4"
        style={{ background: badge.levelBg, color: badge.levelColor }}
        title={`${badge.levelName} level`}
      >
        {badge.levelName}
      </span>
      {badge.flair && (
        <span className="chip bg-brand-500/15 px-1.5 py-0 text-[10px] font-semibold leading-4 text-brand-300">{badge.flair}</span>
      )}
    </span>
  );
}

export function ForumBoard({
  initialPosts,
  badges = {},
  currentUser,
  adminView = null,
}: {
  initialPosts: ForumPostDTO[];
  badges?: Record<string, PublicBadge>;
  currentUser: { id: string; name: string; isAdmin: boolean; emailVerified: boolean } | null;
  adminView?: ForumAdminView | null;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<ForumPostDTO[]>(initialPosts);
  const [filter, setFilter] = useState<"all" | ForumKind>("all");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [clearingSeed, setClearingSeed] = useState(false);
  const { country, fmt } = useCountry();
  const myCountryName = MARKET_COUNTRY[country] ?? DEFAULT_COUNTRY;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm, country: myCountryName });
  const [items, setItems] = useState<ForumItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPost, setOpenPost] = useState<ForumPostDTO | null>(null);
  const [resentVerify, setResentVerify] = useState(false);

  // A server re-render (admin region switch, country change, router.refresh)
  // delivers a fresh list — sync it in and jump back to the first page.
  useEffect(() => {
    setPosts(initialPosts);
    setPage(1);
  }, [initialPosts]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Full reload so the server re-renders signed-out with the cleared cookie.
    window.location.reload();
  }

  // Admin-only: wipe all synthetic seed listings + comments, then re-fetch.
  async function clearSeedData() {
    const n = adminView?.seedCount ?? 0;
    if (typeof window !== "undefined" &&
        !window.confirm(`Delete all ${n} synthetic seed listing${n === 1 ? "" : "s"} (and their comments)? This can't be undone.`)) {
      return;
    }
    setClearingSeed(true);
    try {
      const res = await fetch("/api/admin/forum/clear-seed", { method: "POST" });
      if (res.ok) router.refresh();
    } catch {
      /* ignore — list is unchanged on failure */
    } finally {
      setClearingSeed(false);
    }
  }

  async function resendVerify() {
    await fetch("/api/auth/resend-verify", { method: "POST" }).catch(() => {});
    setResentVerify(true);
  }

  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.kind === filter)),
    [posts, filter]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Keep the current page in range when the filtered list shrinks (filter change, delete).
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [filtered, safePage]
  );

  function goToPage(n: number) {
    const clamped = Math.min(Math.max(1, n), pageCount);
    setPage(clamped);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Reset to the first page whenever the active filter changes.
  useEffect(() => { setPage(1); }, [filter]);

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

  function bumpCommentCount(postId: string) {
    setPosts((ps) => ps.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)));
    setOpenPost((op) => (op && op.id === postId ? { ...op, commentCount: op.commentCount + 1 } : op));
  }

  function resetForm() {
    setForm({ ...emptyForm, country: myCountryName });
    setItems([]);
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  function startEdit(p: ForumPostDTO) {
    setEditingId(p.id);
    setForm({
      kind: p.kind,
      title: p.title,
      price: p.priceCents != null ? (p.priceCents / 100).toString() : "",
      body: p.body ?? "",
      contact: p.contact ?? "",
      country: p.country ?? myCountryName,
      state: p.state ?? "",
      website: "",
    });
    setItems(p.items ?? []);
    setShowForm(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePost(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this post? This can't be undone.")) return;
    const prev = posts;
    setPosts((ps) => ps.filter((p) => p.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/forum/${id}`, { method: "DELETE" });
      if (!res.ok) setPosts(prev); // restore on failure
    } catch {
      setPosts(prev);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        items: isDiscussion ? [] : items.map((i) => ({ name: i.name, setCode: i.setCode, condition: i.condition, qty: i.qty })),
      };
      const res = await fetch(editingId ? `/api/forum/${editingId}` : "/api/forum", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else if (data.post) {
        const post = data.post as ForumPostDTO;
        setPosts((ps) =>
          editingId
            ? ps.map((p) => (p.id === post.id ? { ...post, commentCount: p.commentCount } : p))
            : [{ ...post, commentCount: 0 }, ...ps]
        );
        resetForm();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Forum</h1>
          <p className="mt-1 text-sm text-slate-400">
            Buy, sell and talk Riftbound with other players in {myCountryName}. List several cards in one
            post and trade directly — grab a bundle from one seller and save on postage.
          </p>
        </div>
        {!currentUser ? (
          <Link href="/login?next=/forum" className="btn-primary shrink-0">Log in to post</Link>
        ) : !currentUser.emailVerified ? (
          <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
            <span className="text-xs text-slate-400">
              Signed in as <span className="font-semibold text-white">{currentUser.name}</span>
            </span>
            <span className="text-xs text-gold">
              Confirm your email to post.{" "}
              {resentVerify ? (
                <span className="font-semibold">Sent — check your inbox.</span>
              ) : (
                <button onClick={resendVerify} className="font-semibold underline hover:text-white">Resend email</button>
              )}
            </span>
          </div>
        ) : (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-xs text-slate-400">
              Signed in as <span className="font-semibold text-white">{currentUser.name}</span>
            </span>
            <div className="flex items-center gap-2">
              <button onClick={logout} className="btn-ghost text-sm">Log out</button>
              <button onClick={() => (showForm ? resetForm() : setShowForm(true))} className="btn-primary">
                {showForm ? "Close" : "+ New post"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin-only control bar: switch region view + clear synthetic seed data */}
      {currentUser?.isAdmin && adminView && (
        <div className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-xs font-bold uppercase tracking-wide text-brand-400">Admin · region view</span>
            <div className="flex flex-wrap gap-2">
              {([
                ["ALL", "All regions", adminView.counts.total],
                ["AU", "Australia", adminView.counts.AU],
                ["NZ", "New Zealand", adminView.counts.NZ],
                ["US", "United States", adminView.counts.US],
              ] as const).map(([m, label, count]) => (
                <Link
                  key={m}
                  href={`/forum?market=${m}`}
                  scroll={false}
                  className={`chip font-semibold ${adminView.market === m ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "bg-ink-800 text-slate-400 hover:text-white"}`}
                >
                  {label} <span className="text-slate-500">({count})</span>
                </Link>
              ))}
            </div>
            <button
              onClick={clearSeedData}
              disabled={clearingSeed || adminView.seedCount === 0}
              className="chip ml-auto bg-rose-500/15 font-semibold text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {clearingSeed ? "Deleting…" : `Delete dummy data (${adminView.seedCount})`}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Only admins can see this bar. Region buttons show listings from any market; “Delete dummy
            data” removes only the synthetic seed listings, never real members’ posts.
          </p>
        </div>
      )}

      {/* Trade-safely notice (standard P2P disclaimer) */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-900/60 p-3.5">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p className="text-xs leading-relaxed text-slate-400">
          <span className="font-semibold text-slate-300">Trade safely.</span> Listings are posted by other
          players — treat them as unverified. Never share passwords or financial details, and prefer secure,
          tracked payment and postage. RiftCompare is not a party to any trade between members.
        </p>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card-surface mb-6 space-y-3 p-4">
          {editingId && (
            <div className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 text-xs">
              <span className="font-semibold text-brand-400">Editing your post</span>
              <button type="button" onClick={resetForm} className="text-slate-400 hover:text-white">Cancel</button>
            </div>
          )}
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
            placeholder={isDiscussion ? "Title (required) — e.g. Best budget Calm deck?" : "Title (required) — e.g. Selling my Origins doubles"}
            className="input"
            required
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
                          {it.marketCents != null ? `${fmt(it.marketCents)} market ea` : "no market price"}
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
                        <button type="button" aria-label="Decrease quantity" onClick={() => updateItem(idx, { qty: Math.max(1, it.qty - 1) })} className="grid h-6 w-6 place-items-center rounded bg-ink-800 text-slate-300 hover:bg-ink-700">−</button>
                        <span className="w-5 text-center text-sm text-white">{it.qty}</span>
                        <button type="button" aria-label="Increase quantity" onClick={() => updateItem(idx, { qty: Math.min(99, it.qty + 1) })} className="grid h-6 w-6 place-items-center rounded bg-ink-800 text-slate-300 hover:bg-ink-700">+</button>
                      </div>
                      <button type="button" onClick={() => removeItem(idx)} aria-label="Remove" className="px-1 text-slate-500 hover:text-rose-400">✕</button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2 text-sm">
                    <span className="text-slate-400">Recommended total · {totalQty} {totalQty === 1 ? "card" : "cards"}</span>
                    <span className="font-bold text-accent">{fmt(recommendedCents)}</span>
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
              placeholder="Your asking price for the lot (optional)"
              inputMode="decimal"
              className="input"
            />
          )}

          {!isDiscussion && (
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={form.country} onChange={set("country")} className="input" aria-label="Country">
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {statesFor(form.country) ? (
                <select value={form.state} onChange={set("state")} className="input" aria-label="State or region">
                  <option value="">State / region (optional)</option>
                  {statesFor(form.country)!.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              ) : (
                <input value={form.state} onChange={set("state")} placeholder="State / region (optional)" className="input" maxLength={60} />
              )}
            </div>
          )}

          <textarea
            value={form.body}
            onChange={set("body")}
            placeholder={isDiscussion ? "What's on your mind? (optional)" : "Description (optional) — condition notes, location, postage, combined-postage offers, etc."}
            className="input min-h-[90px]"
          />

          {!isDiscussion && (
            <div>
              <input
                value={form.contact}
                onChange={set("contact")}
                placeholder="Contact — email or Discord (optional, shown publicly)"
                className="input"
                maxLength={160}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Contact is optional — but buyers can only reach you directly if you add one. Only the
                title is required.
              </p>
            </div>
          )}

          {/* Honeypot */}
          <input value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              Posting as <span className="text-slate-300">{currentUser?.name}</span>. Never share passwords or financial details.
            </p>
            <button type="submit" disabled={submitting} className="btn-primary shrink-0 disabled:opacity-50">
              {submitting ? (editingId ? "Saving…" : "Posting…") : editingId ? "Save changes" : "Post"}
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
          {pageItems.map((p) => (
            <li
              key={p.id}
              className={`card-surface overflow-hidden transition-colors hover:border-brand-500/40 ${p.status === "SOLD" ? "opacity-75" : ""}`}
            >
              <div onClick={() => setOpenPost(p)} className="cursor-pointer p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip font-bold ${KIND_BADGE[p.kind]}`}>
                    {p.kind === "DISCUSSION" ? "DISCUSSION" : p.kind === "WTB" ? "WANT TO BUY" : "WANT TO SELL"}
                  </span>
                  {p.status === "SOLD" && (
                    <span className="chip bg-rose-500/15 font-bold text-rose-300 ring-1 ring-rose-500/30">SOLD</span>
                  )}
                  {adminView?.market === "ALL" && (
                    <span className="chip bg-ink-800 font-bold text-slate-300">{p.market}</span>
                  )}
                  {p.priceCents != null && <span className="chip bg-ink-800 font-bold text-accent">{fmt(p.priceCents)} asking</span>}
                  {(p.state || p.country) && (
                    <span className="chip bg-ink-800 text-slate-300">{[p.state, p.country].filter(Boolean).join(", ")}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setOpenPost(p); }}
                    className="ml-auto flex items-center gap-1 rounded-full bg-ink-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-ink-700 hover:text-white"
                    title="View comments"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    {p.commentCount} {p.commentCount === 1 ? "comment" : "comments"}
                  </button>
                </div>

                <h2 className="mt-2 font-bold text-white">{p.title}</h2>

                {p.items && p.items.length > 0 && (
                  <div className="mt-2 rounded-xl border border-ink-700 bg-ink-900/40 p-2">
                    <ul className="divide-y divide-ink-800/70">
                      {p.items.slice(0, 6).map((it, i) => (
                        <li key={i} className="flex items-center gap-2 py-1 text-sm">
                          <span className="w-7 shrink-0 text-slate-500">{it.qty}×</span>
                          <span className="min-w-0 flex-1 truncate text-slate-200">
                            {it.name}
                            {it.condition && it.condition !== "Any" ? <span className="text-xs text-slate-500"> · {it.condition}</span> : null}
                          </span>
                          <span className="shrink-0 text-xs text-slate-400">{it.marketCents != null ? fmt(it.marketCents) : "—"}</span>
                        </li>
                      ))}
                    </ul>
                    {p.items.length > 6 && <p className="px-1 pt-1 text-[11px] text-slate-500">+{p.items.length - 6} more — open to see all</p>}
                    {p.marketCents != null && (
                      <div className="mt-1 flex items-center justify-between border-t border-ink-800 px-1 pt-1 text-xs">
                        <span className="text-slate-500">Recommended (market) total</span>
                        <span className="font-bold text-accent">{fmt(p.marketCents)}</span>
                      </div>
                    )}
                  </div>
                )}

                {p.body && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{p.body}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  {p.userId ? (
                    <Link href={`/forum/seller/${p.userId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand-400 hover:underline">{p.authorName}</Link>
                  ) : (
                    <span className="font-medium text-slate-400">{p.authorName}</span>
                  )}
                  {p.userId && <AuthorBadges badge={badges[p.userId]} />}
                  <span>·</span>
                  <span title={timeAgo(p.createdAt)}>{formatDateTime(p.createdAt)}</span>
                  {p.contact && (
                    <>
                      <span>·</span>
                      <span>Contact: <span className="text-slate-300">{p.contact}</span></span>
                    </>
                  )}
                  {currentUser && p.userId === currentUser.id && (
                    <>
                      <span>·</span>
                      <button onClick={(e) => { e.stopPropagation(); startEdit(p); }} className="text-brand-400 hover:underline">Edit</button>
                      <button onClick={(e) => { e.stopPropagation(); deletePost(p.id); }} className="text-rose-400 hover:underline">Delete</button>
                    </>
                  )}
                  {currentUser?.isAdmin && p.userId !== currentUser.id && (
                    <>
                      <span>·</span>
                      <button onClick={(e) => { e.stopPropagation(); deletePost(p.id); }} className="text-rose-400 hover:underline">Delete</button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-1.5" aria-label="Forum pagination">
          <button
            onClick={() => goToPage(safePage - 1)}
            disabled={safePage <= 1}
            className="chip bg-ink-800 font-semibold text-slate-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            ← Prev
          </button>
          {pageWindow(safePage, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1.5 text-sm text-slate-600">…</span>
            ) : (
              <button
                key={n}
                onClick={() => goToPage(n)}
                aria-current={n === safePage ? "page" : undefined}
                className={`chip font-semibold ${n === safePage ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "bg-ink-800 text-slate-400 hover:text-white"}`}
              >
                {n}
              </button>
            )
          )}
          <button
            onClick={() => goToPage(safePage + 1)}
            disabled={safePage >= pageCount}
            className="chip bg-ink-800 font-semibold text-slate-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next →
          </button>
        </nav>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-600">
        RiftCompare hosts these community listings but is not a party to any trade. Deal carefully and meet/pay safely.
      </p>

      {openPost && (
        <ForumPostModal
          post={openPost}
          currentUser={currentUser ? { id: currentUser.id, name: currentUser.name } : null}
          onClose={() => setOpenPost(null)}
          onCommentAdded={bumpCommentCount}
        />
      )}
    </div>
  );
}
