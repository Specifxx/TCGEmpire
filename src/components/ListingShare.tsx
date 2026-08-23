"use client";

import { useState } from "react";
import { CopyPostButton } from "./CopyPostButton";

/**
 * "Share" on a seller's own listing: mints the public /l/<token> link on first
 * use and hands back a ready-to-paste post.
 *
 * The post text is built SERVER-side (see the share route) rather than here,
 * because the line that makes it worth using — "22% under the cheapest store
 * price" — needs the card's live market price, which this component does not
 * have and should not fetch separately just to format a string.
 *
 * Fetched on demand, not on render: a seller with forty listings would
 * otherwise fire forty POSTs (each of which WRITES a token) just by opening the
 * dashboard.
 */
export function ListingShare({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [post, setPost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (post || busy) return; // already loaded, or a click landed mid-flight
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/listings/${listingId}/share`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { post?: string; error?: string } | null;
      if (!res.ok || !data?.post) {
        setError(data?.error ?? "Could not create a share link.");
      } else {
        setPost(data.post);
      }
    } catch {
      setError("Could not create a share link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-ink-700"
      >
        {open ? "Close" : "Share"}
      </button>
      {open && (
        // basis-full so the panel drops onto its own line inside the row's
        // flex-wrap layout rather than squeezing the controls beside it.
        <div className="basis-full rounded-lg border border-ink-700 bg-ink-900/60 p-3">
          {busy && <p className="text-xs text-slate-400">Creating your link…</p>}
          {error && <p className="text-xs text-rose-300">{error}</p>}
          {post && (
            <>
              <p className="mb-2 text-[11px] text-slate-400">
                Paste this into a Discord or Facebook trading group — the link unfurls with the card art and your price.
              </p>
              <CopyPostButton text={post} label="Copy post" />
            </>
          )}
        </div>
      )}
    </>
  );
}
