"use client";

import { useState } from "react";

// The opt-in card for the weekly watched-cards email on /watching (lib/watch-digest.ts). Rendered only for accounts in
// the offer arm; nothing is sent until the button is pressed.
export function WatchDigestToggle({ initialOn }: { initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/watch-digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on: !on }) });
      if (r.ok) setOn(!on);
      else setError("Couldn't save that. Please try again.");
    } catch {
      setError("Couldn't save that. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Weekly email" className="card-surface mb-5 flex flex-wrap items-center justify-between gap-3 p-4" data-watch-digest>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-white">{on ? "Your weekly watched-cards email is on" : "Get your watched cards by email, once a week"}</p>
        <p className="mt-0.5 text-slate-400">
          {on
            ? "Each week: today's cheapest price for the cards you watch, and how far each has moved since you started. Stop it here or from any email."
            : "Today's cheapest price for each card you watch, and which ones are cheaper than when you started. Free, one email a week, stop any time."}
        </p>
        {error && <p className="mt-1 text-red-400" role="alert">{error}</p>}
      </div>
      <button type="button" onClick={flip} disabled={busy} className={on ? "rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200" : "btn-buy px-4 py-2 text-sm"}>
        {busy ? "Saving…" : on ? "Turn off" : "Turn on"}
      </button>
    </section>
  );
}
