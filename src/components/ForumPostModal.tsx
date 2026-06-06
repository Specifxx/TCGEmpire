"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAUD } from "@/lib/format";
import type { ForumKind, ForumPostDTO } from "./ForumBoard";

interface Comment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

const KIND_BADGE: Record<ForumKind, string> = {
  WTB: "bg-emerald-500/15 text-emerald-300",
  WTS: "bg-gold/15 text-gold",
  DISCUSSION: "bg-sky-500/15 text-sky-300",
};
const KIND_TEXT: Record<ForumKind, string> = { WTB: "WANT TO BUY", WTS: "WANT TO SELL", DISCUSSION: "DISCUSSION" };

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Absolute date + time, e.g. "6 Jun 2026, 11:30 pm".
function dateTime(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function ForumPostModal({
  post,
  currentUser,
  onClose,
  onCommentAdded,
}: {
  post: ForumPostDTO;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
  onCommentAdded: (postId: string) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/forum/${post.id}/comments`)
      .then((r) => r.json())
      .then((d) => { if (alive) setComments(d.comments ?? []); })
      .catch(() => { if (alive) setComments([]); });
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [post.id, onClose]);

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forum/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json();
      if (res.ok && data.comment) {
        setComments((cs) => [...(cs ?? []), data.comment as Comment]);
        setText("");
        onCommentAdded(post.id);
      }
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false);
    }
  }

  const location = [post.state, post.country].filter(Boolean).join(", ");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-ink-950/80 text-slate-300 hover:text-white"
        >
          ✕
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Post detail */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip font-bold ${KIND_BADGE[post.kind]}`}>{KIND_TEXT[post.kind]}</span>
            {post.priceCents != null && <span className="chip bg-ink-800 font-bold text-accent">{formatAUD(post.priceCents)} asking</span>}
            {location && <span className="chip bg-ink-800 text-slate-300">{location}</span>}
          </div>
          <h2 className="mt-2 text-lg font-bold text-white">{post.title}</h2>

          {post.items && post.items.length > 0 && (
            <ul className="mt-2 divide-y divide-ink-800 rounded-xl border border-ink-700 bg-ink-900/40 p-2">
              {post.items.map((it, i) => (
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
          )}

          {post.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{post.body}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {post.userId ? (
              <Link href={`/forum/seller/${post.userId}`} className="font-medium text-brand-400 hover:underline">{post.authorName}</Link>
            ) : (
              <span className="font-medium text-slate-400">{post.authorName}</span>
            )}
            <span>·</span>
            <span title={ago(post.createdAt)}>Posted {dateTime(post.createdAt)}</span>
            {post.contact && (
              <>
                <span>·</span>
                <span>Contact: <span className="text-slate-300">{post.contact}</span></span>
              </>
            )}
          </div>

          {/* Comments */}
          <h3 className="mt-6 border-t border-ink-800 pt-4 text-sm font-bold text-white">
            Comments {comments ? `(${comments.length})` : ""}
          </h3>
          {comments === null ? (
            <p className="py-4 text-sm text-slate-500">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No comments yet — be the first.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="rounded-xl bg-ink-850 p-3">
                  <div className="text-xs text-slate-500">
                    <span className="font-medium text-slate-300">{c.authorName}</span>{" "}
                    · <span title={ago(c.createdAt)}>{dateTime(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add comment */}
        {currentUser ? (
          <form onSubmit={addComment} className="flex items-center gap-2 border-t border-ink-700 p-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment…"
              maxLength={2000}
              className="input"
            />
            <button type="submit" disabled={submitting || !text.trim()} className="btn-primary shrink-0 disabled:opacity-50">
              {submitting ? "…" : "Comment"}
            </button>
          </form>
        ) : (
          <div className="border-t border-ink-700 p-3 text-center text-sm text-slate-400">
            <Link href="/login?next=/forum" className="text-brand-400 hover:underline">Log in</Link> to comment.
          </div>
        )}
      </div>
    </div>
  );
}
