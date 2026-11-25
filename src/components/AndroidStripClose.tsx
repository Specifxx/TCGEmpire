"use client";
// The ✕ on the Android tester line (AndroidBetaStrip.tsx). Closed, the line stays away for 30 days.
export const ANDROID_STRIP_CLOSED_KEY = "rc-android-strip-closed";
export const ANDROID_STRIP_SEEN_KEY = "rc-android-strip-seen";
const DAY = 86_400_000;

/**
 * Runs inline right after the hidden line: shows it before paint for an Android browser that is not the app's WebView
 * ("; wv)" in the user agent, or the Capacitor runtime), has not closed it in 30 days, is not on /android, and has not
 * seen it yet this visit (sessionStorage). When it shows, the seasonal sale line on the page is hidden.
 */
export const ANDROID_STRIP_BOOT = `try{var s=document.currentScript&&document.currentScript.previousElementSibling,u=navigator.userAgent||"";if(s&&/Android/i.test(u)&&!/; wv\\)/.test(u)&&!window.Capacitor&&!/^\\/android\\/?$/.test(location.pathname)&&!(+localStorage.getItem(${JSON.stringify(
  ANDROID_STRIP_CLOSED_KEY,
)})>Date.now())&&!sessionStorage.getItem(${JSON.stringify(ANDROID_STRIP_SEEN_KEY)})){s.style.display="";sessionStorage.setItem(${JSON.stringify(
  ANDROID_STRIP_SEEN_KEY,
)},"1");var h=document.querySelector("[data-holiday-strip]");if(h)h.style.display="none"}}catch(e){}`;

export function AndroidStripClose() {
  return (
    <button
      type="button"
      aria-label="Hide this line for 30 days"
      title="Hide this line for 30 days"
      className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-ink-800 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400"
      onClick={(e) => {
        try {
          localStorage.setItem(ANDROID_STRIP_CLOSED_KEY, String(Date.now() + 30 * DAY));
        } catch {
          /* not remembered: hidden for this page only */
        }
        const strip = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-android-strip]");
        if (strip) strip.style.display = "none";
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}
