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
export function sanitizeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/api")) return null;
  return next;
}
