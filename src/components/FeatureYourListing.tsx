"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useMe } from "@/lib/use-me";

// The /featured page's "Feature your listing" panel (lib/featured/). Signed out:
// sign in. Free: what Premium adds. Premium: paste a link, see each listing's
// state (waiting for our eBay check, live, or why not), remove one.
interface Mine {
  id: string;
  itemId: string;
  status: "pending" | "live" | "rejected" | "ended" | "removed";
  reason: string | null;
  title: string | null;
}

const STATUS: Record<Mine["status"], { text: string; tone: string }> = {
  pending: { text: "Waiting for our eBay check (within about 4 hours)", tone: "text-slate-300" },
  live: { text: "Live on this page", tone: "text-emerald-400" },
  rejected: { text: "Not featured", tone: "text-rose-400" },
  ended: { text: "Ended", tone: "text-slate-500" },
  removed: { text: "Removed", tone: "text-slate-500" },
};

export function FeatureYourListing({ limit, days }: { limit: number; days: number }) {
  const me = useMe();
  const [mine, setMine] = useState<Mine[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/featured-listings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMine(Array.isArray(d?.mine) ? d.mine : []))
      .catch(() => {});
  }, []);
  const premium = me.premium;
  useEffect(() => {
    if (me.loaded && me.user && premium) load();
  }, [me.loaded, me.user, premium, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/featured-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setLink("");
        setMsg("Added. We check it with eBay within about four hours, and it appears here once eBay shows it is live.");
        load();
      } else {
        setMsg(d?.message ?? (r.status === 403 ? "Featuring a listing is part of Premium." : "That didn't work. Try again."));
      }
    } catch {
      setMsg("That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/featured-listings?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <section aria-labelledby="feature-yours" className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 via-ink-900 to-ink-950 p-4 sm:p-5">
      <h2 id="feature-yours" className="text-lg font-extrabold text-white">
        Selling Riftbound on eBay? Feature your listing here
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        A RiftCompare Premium feature. Paste the link to your own eBay listing (eBay&apos;s share link works too). Once eBay
        shows it is a live Riftbound listing, it is featured on this page until it sells or ends, for up to {days} days,
        with up to {limit} listings at a time.
      </p>

      {!me.loaded ? null : !me.user ? (
        <p className="mt-3 text-sm">
          <Link href="/login?next=/featured&src=featured" className="btn-primary inline-flex px-4 py-2 text-sm">
            Sign in to feature a listing
          </Link>
        </p>
      ) : !premium ? (
        <p className="mt-3 text-sm">
          <Link href="/premium?from=featured" className="btn-primary inline-flex px-4 py-2 text-sm">
            Get Premium to feature your listings
          </Link>
        </p>
      ) : (
        <>
          <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="feature-link" className="sr-only">
              Link to your eBay listing
            </label>
            <input
              id="feature-link"
              type="url"
              inputMode="url"
              required
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.ebay.com.au/itm/…"
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white placeholder:text-slate-600"
            />
            <button type="submit" disabled={busy} className="btn-primary px-4 py-2 text-sm disabled:opacity-60">
              {busy ? "Adding…" : "Feature it"}
            </button>
          </form>
          {msg && <p className="mt-2 text-sm text-slate-300" role="status">{msg}</p>}
          {mine.length > 0 && (
            <ul className="mt-3 divide-y divide-ink-800 rounded-lg border border-ink-800">
              {mine.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-200">{m.title ?? `eBay listing ${m.itemId}`}</span>
                  <span className={`text-xs ${STATUS[m.status].tone}`}>
                    {STATUS[m.status].text}
                    {m.reason && m.status !== "live" ? `: ${m.reason}` : ""}
                  </span>
                  {(m.status === "pending" || m.status === "live") && (
                    <button type="button" onClick={() => remove(m.id)} className="text-xs text-slate-500 hover:text-rose-400">
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
