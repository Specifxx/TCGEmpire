"use client";

import { useEffect, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";
import {
  ISSUES,
  MAX_NOTE,
  issueWantsPrice,
  type IssueCode,
  type ReportableListing,
  type ReportSubject,
} from "@/lib/price-report";

// ── "Report a wrong price" ───────────────────────────────────────────────────
//
// One shared affordance for all three surfaces that show listings: the card
// page's price table, the card quick-view, and the sealed quick-view. Same
// component, same dialog, same endpoint — a report filed from a popup is worth
// exactly as much as one filed from a page, and three near-identical forms would
// have drifted apart within a month.
//
// ONE LINK PER LIST, NOT A FLAG ON EVERY ROW. A per-row report control is more
// precise and worse: it puts a second clickable thing beside every buy button
// (the one action these surfaces exist to drive), on rows that are already dense
// with price, postage, condition and store name — and on a phone the two targets
// end up adjacent. A single quiet link under the list, with the store chosen
// inside the dialog from the same listings just displayed, keeps the precision
// and costs the list nothing.
//
// WHAT IT DOES NOT SEND: a price. The store, the issue and an optional claimed
// correction go up; what WE were showing is looked up server-side from our own
// database. See the route header — that figure has to be one an admin can trust.
//
// DELIBERATELY UNGATED. Requiring an account would mean only members can tell us
// our data is broken, and the person best placed to notice a wrong price is the
// stranger who arrived from a search, compared our number to the shop's, and
// would otherwise just close the tab. Nothing submitted here is ever published,
// which is what makes that safe.

type Props = {
  subject: ReportSubject;
  listings: ReportableListing[];
  /** Compact styling for use inside a modal, where vertical space is scarce. */
  compact?: boolean;
  className?: string;
};

export function ReportPriceButton({ subject, listings, compact, className }: Props) {
  const [open, setOpen] = useState(false);

  // Nothing to point at, nothing to report. Rendering the link over an empty
  // list would open a dialog whose first question has no answers.
  if (!listings.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`underline decoration-dotted underline-offset-2 transition-colors hover:text-slate-300 ${
          compact ? "text-[11px] text-slate-500" : "text-xs text-slate-500"
        } ${className ?? ""}`}
      >
        Spotted a wrong price? Report it
      </button>
      {open && <ReportDialog subject={subject} listings={listings} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({
  subject,
  listings,
  onClose,
}: {
  subject: ReportSubject;
  listings: ReportableListing[];
  onClose: () => void;
}) {
  const { country } = useCountry();
  const [retailer, setRetailer] = useState(listings[0]?.retailer ?? "");
  const [issue, setIssue] = useState<IssueCode>("PRICE_WRONG");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstField = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    firstField.current?.focus();
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const chosen = listings.find((l) => l.retailer === retailer);
  const wantsPrice = issueWantsPrice(issue);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Dollars in the box, integer cents on the wire — the server rejects a
      // non-integer rather than rounding, so the conversion happens exactly once,
      // here, where the input is.
      const trimmed = price.trim();
      const cents = wantsPrice && trimmed ? Math.round(Number(trimmed) * 100) : null;
      if (cents != null && !Number.isFinite(cents)) {
        setError("That price doesn't look like a number.");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/price-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: subject.kind,
          cardId: subject.kind === "card" ? subject.cardId : undefined,
          groupKey: subject.kind === "sealed" ? subject.groupKey : undefined,
          listingId: chosen?.listingId,
          retailer,
          retailerName: chosen?.retailerName,
          country,
          issue,
          actualPriceCents: cents,
          note: note.trim() || undefined,
          email: email.trim() || undefined,
          page: typeof window !== "undefined" ? window.location.pathname : undefined,
          website,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send that — please try again.");
        setBusy(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Couldn't send that — please try again.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Report a wrong price"
      onClick={onClose}
    >
      <div
        className="card-surface max-h-[92vh] w-full max-w-md overflow-y-auto rounded-b-none sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-800 p-4">
          <div className="min-w-0">
            <h2 className="font-bold text-white">Report a wrong price</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{subject.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-ink-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {done ? (
          /* No "we'll fix it by Tuesday" promise. The honest outcome is that a
             person will look, which is exactly what the report buys. */
          <div className="p-6 text-center">
            <div className="text-3xl" aria-hidden>✓</div>
            <p className="mt-2 font-semibold text-white">Thanks — that&apos;s logged.</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              We check reported listings against the store and fix what&apos;s wrong at the source, so it stays fixed for
              everyone.
            </p>
            <button type="button" onClick={onClose} className="btn-primary mt-4 text-sm">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 p-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Which store?</span>
              <select
                ref={firstField}
                value={retailer}
                onChange={(e) => setRetailer(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white"
              >
                {/* Keyed by retailer, which is unique within one product's list —
                    the surfaces pass at most one row per store. */}
                {listings.map((l) => (
                  <option key={l.retailer} value={l.retailer}>
                    {l.retailerName}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">What&apos;s wrong?</legend>
              <div className="mt-1 space-y-1.5">
                {ISSUES.map((i) => (
                  <label
                    key={i.code}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                      issue === i.code ? "border-brand-500 bg-brand-500/10" : "border-ink-700 hover:border-ink-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="issue"
                      value={i.code}
                      checked={issue === i.code}
                      onChange={() => setIssue(i.code)}
                      className="mt-0.5 accent-brand-500"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-200">{i.label}</span>
                      <span className="block text-xs leading-relaxed text-slate-500">{i.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Only asked where there is a price to give. Every other issue has
                no corrected figure, and an input that can't be filled in is just
                a question the reporter has to skip. */}
            {wantsPrice && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  What does the store actually charge? <span className="font-normal normal-case">(optional)</span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="e.g. 19.95"
                  className="num mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white"
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Anything else? <span className="font-normal normal-case">(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
                rows={2}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Email <span className="font-normal normal-case">(optional — only if you want a reply)</span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-white"
              />
            </label>

            {/* Honeypot — hidden from people and from screen readers, visible to
                a script that fills every input it finds. */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy} className="btn-primary text-sm disabled:opacity-60">
                {busy ? "Sending…" : "Send report"}
              </button>
              <button type="button" onClick={onClose} className="btn-ghost text-sm">
                Cancel
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              No account needed. We record which listing you picked and what our data says about it right now — we
              don&apos;t publish reports.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
