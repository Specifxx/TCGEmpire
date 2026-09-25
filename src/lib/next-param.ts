// The ONE definition of "a safe internal path to return to after sign-in".
//
// ?next= values are attacker-influencable (they ride in URLs), so every reader
// must apply the same rules or the laxest copy becomes the real policy. Before
// this file, /login/page.tsx had two hand-rolled near-copies (safe() and
// cancelTarget()) and the OAuth flow had none at all — it couldn't return to
// `next`, which dumped every fresh signup on /profile no matter where they
// started.
//
// Rules: must be a same-origin absolute path ("/..."), never protocol-relative
// ("//evil.com" parses as a host by browsers), and never an API route (an auth
// redirect into /api/* is at best a JSON screen, at worst a CSRF-shaped
// footgun). Anything else → null; callers pick their own fallback (/profile
// after sign-in, "/" for a cancel link).
//
// BACKSLASHES AND CONTROL CHARACTERS ARE REJECTED OUTRIGHT (review,
// 2026-09-25). The WHATWG URL parser — browsers, and `new URL()` on the
// server — reads "\" as "/" and silently strips tab and newline, so "/\evil.com"
// and "/<TAB>/evil.com" pass a startsWith("//") check yet resolve to
// https://evil.com/. That only mattered once GET /api/market turned this into
// a server-side 307, but every caller gets the stricter rule. As a last check
// the path is resolved against a dummy origin and must stay on it.
const UNSAFE_CHARS = /[\\\x00-\x20\x7f]/;

export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api")) return null;
  if (UNSAFE_CHARS.test(next)) return null;
  try {
    const probe = new URL(next, "https://same-origin.invalid");
    if (probe.origin !== "https://same-origin.invalid" || probe.pathname.startsWith("/api")) return null;
  } catch {
    return null;
  }
  return next;
}
