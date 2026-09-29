// "This browser tab is the one an account was just created in" (2026-09-29).
//
// The OAuth callback marks a NEW account's landing with ?welcome=<provider>,
// and SignupWelcome turns that into analytics and then strips it from the URL.
// Three things need to know about it for longer than that one URL:
//   • PremiumSlideIn stays away for the rest of the session, so the first
//     thing after making a free account is never a request to pay (the
//     2026-09-23 "Premium after sign-up" rule, restated when the slide-in went
//     to page load);
//   • WelcomeChecklist shows on that very landing, however its effect is
//     ordered against SignupWelcome's (which writes the 7-day stamp it reads);
//   • SignupWelcome's own "your account is ready" toast.
//
// sessionStorage, so "the rest of the session" is this tab until it closes;
// the next visit is an ordinary one. The URL check covers the moment before
// SignupWelcome has run. Both fail closed to "not a sign-up session" in
// private mode or on the server.

const KEY = "rc_signup_session";

/** Called by SignupWelcome on a ?welcome landing. */
export function markSignupSession(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* private mode — the URL check below still covers the landing itself */
  }
}

/** True in the tab where an account was just created, from its landing on. */
export function isSignupSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(KEY) === "1") return true;
  } catch {
    /* fall through to the URL */
  }
  try {
    return new URLSearchParams(window.location.search).has("welcome");
  } catch {
    return false;
  }
}
