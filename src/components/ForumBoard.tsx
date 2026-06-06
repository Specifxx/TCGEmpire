"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatAUD } from "@/lib/format";

export interface ForumPostDTO {
  id: string;
  kind: "WTB" | "WTS";
  title: string;
  cardName: string | null;
  setCode: string | null;
  condition: string | null;
  priceCents: number | null;
  body: string;
  contact: string;
  authorName: string;
  userId: string | null;
  score: number;
  createdAt: string; // ISO
}

const SETS = ["", "OGN", "SFD", "UNL", "VEN", "OGS"];
const CONDITIONS = ["", "Any", "NM", "LP", "MP", "HP", "DMG"];
const VOTES_KEY = "rc_forum_votes";

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

const emptyForm = {
  kind: "WTB" as "WTB" | "WTS",
  title: "",
  cardName: "",
  setCode: "",
  condition: "",
  price: "",
  body: "",
  contact: "",
  website: "", // honeypot
};

export function ForumBoard({
  initialPosts,
  currentUser,
}: {
  initialPosts: ForumPostDTO[];
  currentUser: { id: string; name: string } | null;
}) {
  const [posts, setPosts] = useState<ForumPostDTO[]>(initialPosts);
  const [filter, setFilter] = useState<"all" | "WTB" | "WTS">("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, 1 | -1>>({});

  useEffect(() => {
    try {
      setVotes(JSON.parse(localStorage.getItem(VOTES_KEY) || "{}"));
    } catch {
      /* ignore */
    }
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.kind === filter)),
    [posts, filter]
  );

  function persistVotes(next: Record<string, 1 | -1>) {
    setVotes(next);
    try {
      localStorage.setItem(VOTES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  async function vote(id: string, dir: 1 | -1) {
    const current = votes[id] ?? 0;
    const target = current === dir ? 0 : dir; // clicking the same arrow undoes it
    const delta = target - current; // -2..2
    if (delta === 0) return;

    // Optimistic update.
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, score: p.score + delta } : p)));
    const nextVotes = { ...votes };
    if (target === 0) delete nextVotes[id];
    else nextVotes[id] = target;
    persistVotes(nextVotes);

    try {
      const res = await fetch(`/api/forum/${id}/vote?delta=${delta}`, { method: "POST" });
      const data = await res.json();
      if (typeof data.score === "number") {
        setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, score: data.score } : p)));
      }
    } catch {
      /* keep optimistic value */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
      } else if (data.post) {
        setPosts((ps) => [data.post as ForumPostDTO, ...ps]);
        setForm({ ...emptyForm });
        setShowForm(false);
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
          <h1 className="text-2xl font-extrabold text-white">Buy &amp; Sell Forum</h1>
          <p className="mt-1 text-sm text-slate-400">
            A community board for Australian Riftbound players. Post what you&apos;re looking to
            buy or sell and connect directly with other collectors.
          </p>
        </div>
        {currentUser ? (
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary shrink-0">
            {showForm ? "Close" : "+ New post"}
          </button>
        ) : (
          <Link href="/login?next=/forum" className="btn-primary shrink-0">
            Log in to post
          </Link>
        )}
      </div>

      {/* New post form */}
      {showForm && (
        <form onSubmit={submit} className="card-surface mb-6 space-y-3 p-4">
          <div className="flex gap-2">
            {(["WTB", "WTS"] as const).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setForm((f) => ({ ...f, kind: k }))}
                className={`chip font-semibold ${
                  form.kind === k
                    ? k === "WTB"
                      ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
                      : "bg-gold/20 text-gold ring-1 ring-gold/40"
                    : "bg-ink-800 text-slate-400"
                }`}
              >
                {k === "WTB" ? "Want to buy" : "Want to sell"}
              </button>
            ))}
          </div>

          <input
            value={form.title}
            onChange={set("title")}
            placeholder="Title — e.g. LF Sabotage NM, or Selling Origins playset"
            className="input"
            maxLength={140}
          />

          <div className="grid gap-3 sm:grid-cols-4">
            <input value={form.cardName} onChange={set("cardName")} placeholder="Card (optional)" className="input sm:col-span-2" maxLength={120} />
            <select value={form.setCode} onChange={set("setCode")} className="input">
              {SETS.map((s) => (
                <option key={s} value={s}>{s || "Set"}</option>
              ))}
            </select>
            <select value={form.condition} onChange={set("condition")} className="input">
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{c || "Condition"}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.price} onChange={set("price")} placeholder="Price A$ (optional)" inputMode="decimal" className="input" />
            <input value={form.contact} onChange={set("contact")} placeholder="Contact — email or Discord" className="input" maxLength={160} />
          </div>

          <p className="text-[11px] text-slate-500">
            Selling several cards? List them all in one post — buyers can see everything you offer on
            your seller page and save on combined postage.
          </p>

          <textarea
            value={form.body}
            onChange={set("body")}
            placeholder="Details — quantities, condition notes, location, postage, etc."
            className="input min-h-[90px]"
            maxLength={4000}
          />

          {/* Honeypot (hidden from humans) */}
          <input
            value={form.website}
            onChange={set("website")}
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />

          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              Posting as <span className="text-slate-300">{currentUser?.name}</span>. Your name &amp;
              contact are public. Never share passwords or financial details.
            </p>
            <button type="submit" disabled={submitting} className="btn-primary shrink-0 disabled:opacity-50">
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {([
          ["all", "All"],
          ["WTB", "Want to buy"],
          ["WTS", "Want to sell"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`chip font-semibold ${filter === k ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40" : "bg-ink-800 text-slate-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          <div>
            <p className="text-lg font-semibold text-white">No posts yet</p>
            <p className="mt-1 text-sm">Be the first to post a buy or sell listing.</p>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => {
            const v = votes[p.id] ?? 0;
            return (
              <li key={p.id} className="card-surface flex overflow-hidden">
                {/* Vote column */}
                <div className="flex w-12 shrink-0 flex-col items-center justify-start gap-0.5 bg-ink-900/50 py-3">
                  <button
                    onClick={() => vote(p.id, 1)}
                    aria-label="Upvote"
                    className={`grid h-6 w-6 place-items-center rounded hover:bg-ink-800 ${v === 1 ? "text-brand-400" : "text-slate-500"}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </button>
                  <span className={`text-sm font-bold ${v === 1 ? "text-brand-400" : v === -1 ? "text-rose-400" : "text-slate-300"}`}>{p.score}</span>
                  <button
                    onClick={() => vote(p.id, -1)}
                    aria-label="Downvote"
                    className={`grid h-6 w-6 place-items-center rounded hover:bg-ink-800 ${v === -1 ? "text-rose-400" : "text-slate-500"}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`chip font-bold ${
                        p.kind === "WTB"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-gold/15 text-gold"
                      }`}
                    >
                      {p.kind === "WTB" ? "WANT TO BUY" : "WANT TO SELL"}
                    </span>
                    {p.setCode && <span className="chip bg-ink-800 text-slate-300">{p.setCode}</span>}
                    {p.condition && <span className="chip bg-ink-800 text-slate-300">{p.condition}</span>}
                    {p.priceCents != null && (
                      <span className="chip bg-ink-800 font-bold text-accent">{formatAUD(p.priceCents)}</span>
                    )}
                  </div>

                  <h2 className="mt-2 font-bold text-white">{p.title}</h2>
                  {p.cardName && <p className="text-xs text-brand-400">{p.cardName}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{p.body}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {p.userId ? (
                      <Link href={`/forum/seller/${p.userId}`} className="font-medium text-brand-400 hover:underline">
                        {p.authorName}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-400">{p.authorName}</span>
                    )}
                    <span>·</span>
                    <span>{timeAgo(p.createdAt)}</span>
                    <span>·</span>
                    <span>
                      Contact: <span className="text-slate-300">{p.contact}</span>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-600">
        RiftCompareAU hosts these community listings but is not a party to any trade. Deal carefully
        and meet/pay safely.
      </p>
    </div>
  );
}
