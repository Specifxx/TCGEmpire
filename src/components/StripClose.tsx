"use client";
// The ✕ on the one sale line under the header (owner's UX review, 2026-11-24, P0 6: "collapse the promo and disclosure into
// one dismissible line"). Closed, the line stays away for 7 days. The line is in the server HTML; HolidayStrip's inline script
// hides it before first paint for a visitor who closed it, so there is no flash and no layout shift.
export const STRIP_CLOSED_KEY = "rc-promo-strip-closed";
const DAY = 86_400_000;

/** Runs inline right after the strip: hides it before paint when this browser closed it in the last 7 days. */
export const STRIP_BOOT = `try{if(+localStorage.getItem(${JSON.stringify(STRIP_CLOSED_KEY)})>Date.now()){var s=document.currentScript&&document.currentScript.previousElementSibling;if(s)s.style.display="none"}}catch(e){}`;

export function StripClose() {
  return (
    <button
      type="button"
      aria-label="Hide this line for a week"
      title="Hide this line for a week"
      className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-ink-800 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400"
      onClick={(e) => {
        try {
          localStorage.setItem(STRIP_CLOSED_KEY, String(Date.now() + 7 * DAY));
        } catch {
          /* not remembered: hidden for this page only */
        }
        const strip = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-holiday-strip]");
        if (strip) strip.style.display = "none";
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}
