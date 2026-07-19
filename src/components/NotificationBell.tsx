"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

// Relative time, no dependency — "2h ago", "3d ago", falling back to a date
// once it's old enough that "Nd ago" stops being useful.
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Notification bell — only rendered for signed-in users (see NavUser.tsx).
// Polls the cheap unread-count endpoint periodically; the full feed is only
// fetched when the dropdown actually opens, matching the same "don't read
// what you don't need" discipline as the rest of this codebase's egress rules.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) setUnreadCount((await res.json()).unreadCount ?? 0);
    } catch {
      /* best-effort — try again next poll */
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const id = setInterval(refreshCount, 60_000);
    return () => clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && notifications === null) {
      try {
        const res = await fetch("/api/notifications");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications ?? []);
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch {
        setNotifications([]);
      }
    }
  }

  async function markAllRead() {
    setUnreadCount(0);
    setNotifications((rows) => rows?.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() })) ?? null);
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  async function markRead(id: string) {
    setNotifications((rows) => rows?.map((r) => (r.id === id && !r.readAt ? { ...r, readAt: new Date().toISOString() } : r)) ?? null);
    setUnreadCount((n) => Math.max(0, n - 1));
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-ink-800 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-ink-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-300 hover:underline">Mark all read</button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications === null ? (
              <p className="p-4 text-center text-sm text-slate-500">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Nothing yet — sales, purchases and order updates show up here.</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {notifications.map((n) => {
                  const row = (
                    <div className={`flex gap-2 px-4 py-3 ${!n.readAt ? "bg-brand-500/5" : ""}`}>
                      {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <div className={`min-w-0 flex-1 ${n.readAt ? "pl-3.5" : ""}`}>
                        <div className="truncate text-sm font-semibold text-white">{n.title}</div>
                        <div className="text-xs leading-relaxed text-slate-400">{n.body}</div>
                        <div className="mt-0.5 text-[11px] text-slate-600">{timeAgo(n.createdAt)}</div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link href={n.href} onClick={() => { markRead(n.id); setOpen(false); }} className="block hover:bg-ink-800">
                          {row}
                        </Link>
                      ) : (
                        <button onClick={() => markRead(n.id)} className="block w-full text-left hover:bg-ink-800">
                          {row}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
