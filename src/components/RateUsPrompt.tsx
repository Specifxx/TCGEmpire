"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "./ui/Dialog";
import {
  RATE_STORAGE_KEY,
  parseRateState,
  ratingFollowUp,
  shouldAskRating,
  type RateState,
} from "@/lib/rate-prompt";

// "Rate RiftCompare" (owner, 2026-10-26). When it asks is lib/rate-prompt.ts.
// Five big stars and one small "Not now": tapping a star sends the rating at
// once (/api/feedback, source "rating"), a low one then asks what to fix. The
// backdrop and Escape do not close it (the owner asked for it to be hard to
// close), but "Not now" is always there, so it never traps anyone.

type Phase = "ask" | "fix" | "thanks";

function save(s: RateState) {
  try {
    localStorage.setItem(RATE_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode: the prompt simply asks again next visit.
  }
}

function load(now: number): RateState {
  try {
    return parseRateState(localStorage.getItem(RATE_STORAGE_KEY), now);
  } catch {
    return parseRateState(null, now);
  }
}

export function RateUsPrompt() {
  const path = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("ask");
  const [hover, setHover] = useState(0);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false); // never pre-ticked: consent is opt-in

  useEffect(() => {
    const now = Date.now();
    const s = load(now);
    s.pages += 1;
    if (!open && shouldAskRating(s, now, path)) {
      s.asks += 1;
      setOpen(true);
    }
    save(s);
    // Counting page views only: re-running when `open` flips would count twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const post = (body: Record<string, unknown>) =>
    fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, source: "rating", page: path }) }).catch(() => null);

  const rate = (n: number) => {
    setStars(n);
    const s = load(Date.now());
    s.rated = true;
    save(s);
    void post({ rating: n, message: "" });
    setPhase(ratingFollowUp(n));
  };

  const notNow = () => {
    const s = load(Date.now());
    s.snoozedAt = Date.now();
    save(s);
    setOpen(false);
  };

  const sendNote = () => {
    if (note.trim().length >= 10) void post({ message: note.trim() });
    setSent(true);
    setTimeout(() => setOpen(false), 1200);
  };

  // A 4- or 5-star rater may add a few words for the site to show (2026-10-27:
  // reviews on the homepage and the Pro page once 100 people have rated). Its
  // own source, "rating-review", so its stars are not counted twice; shown
  // only if they tick consent AND an admin approves it (lib/reviews.ts).
  const sendReview = () => {
    if (note.trim().length >= 10) {
      void fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: stars, message: note.trim(), source: "rating-review", page: path, consentPublic: consent, displayName: consent ? name.trim() : "" }),
      }).catch(() => null);
    }
    setSent(true);
    setTimeout(() => setOpen(false), 1200);
  };

  const shown = hover || stars;
  return (
    <Dialog open={open} onClose={() => {}} label="Rate RiftCompare" size="md" z="modal">
      <div className="px-6 pb-5 pt-6 text-center" data-rate-prompt>
        {phase === "ask" && (
          <>
            <h2 className="font-display text-xl font-extrabold text-white">How would you rate RiftCompare?</h2>
            <p className="mt-1 text-sm text-slate-400">One tap. It helps other players find us.</p>
            <div className="mt-4 flex justify-center gap-1" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={stars === n}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  onMouseEnter={() => setHover(n)}
                  onFocus={() => setHover(n)}
                  onClick={() => rate(n)}
                  className={`text-5xl leading-none transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${n <= shown ? "text-gold" : "text-ink-600"}`}
                >
                  ★
                </button>
              ))}
            </div>
            <button type="button" onClick={notNow} className="mt-5 text-xs text-slate-500 hover:text-slate-300 hover:underline">
              Not now
            </button>
          </>
        )}
        {phase === "fix" && (
          <>
            <h2 className="font-display text-xl font-extrabold text-white">Thanks. What should we fix?</h2>
            <p className="mt-1 text-sm text-slate-400">Your {stars}-star rating is saved. A sentence helps us more than anything.</p>
            {sent ? (
              <p className="mt-4 text-sm font-semibold text-up">Got it, thank you.</p>
            ) : (
              <>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="mt-4 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white"
                  placeholder="What was missing, wrong or confusing?"
                />
                <div className="mt-3 flex items-center justify-center gap-3">
                  <button type="button" onClick={sendNote} className="btn-primary">
                    Send
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
                    Skip
                  </button>
                </div>
              </>
            )}
          </>
        )}
        {phase === "thanks" && (
          <>
            <div className="text-4xl text-gold" aria-hidden>
              {"★".repeat(stars)}
            </div>
            <h2 className="mt-2 font-display text-xl font-extrabold text-white">Thank you!</h2>
            <p className="mt-1 text-sm text-slate-400">Your rating is saved. Want to tell other players why?</p>
            {sent ? (
              <p className="mt-4 text-sm font-semibold text-up">Thank you, that really helps.</p>
            ) : (
              <>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="mt-4 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white"
                  placeholder="What do you use RiftCompare for? (optional)"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm text-white"
                  placeholder="Name to show (optional)"
                />
                <label className="mt-2 flex items-start gap-2 text-left text-xs text-slate-400">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                  RiftCompare may show this on the site.
                </label>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <button type="button" onClick={sendReview} className="btn-primary">
                    {note.trim().length >= 10 ? "Send" : "Done"}
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">
                    Back to the site
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
