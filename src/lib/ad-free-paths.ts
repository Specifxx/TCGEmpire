// Pages that never carry an ad (coordinator for the owner, 2026-11-19): Premium (it promises no ads), the account, sign-in,
// collection, watch list, portfolio and giveaway pages are conversion and utility pages, so the layout's ad units stand down on
// them. Pure, for the tests.
export const AD_FREE_PREFIXES = [
  "/premium",
  "/account",
  "/collection",
  "/watches",
  "/watching",
  "/portfolio",
  "/dashboard",
  "/profile",
  "/login",
  "/signin",
  "/sign-in",
  "/giveaway",
] as const;

export function adFreePath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = path.split(/[?#]/)[0].toLowerCase();
  return AD_FREE_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}
