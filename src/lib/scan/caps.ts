// Card scanner spend and access rules (DECISIONS.md, 2026-11-19 "Card scanner beta"). Pure, for the tests.
//
// - Off unless ANTHROPIC_API_KEY is set (Vercel Production only; never a client prop).
// - Private beta: only admins scan until SCAN_PUBLIC=1 (the owner's call, after the accuracy report).
// - SCAN_DAILY_CAP scans a UTC day across the whole site (default 300, about US$0.06 a day at Haiku 5.5 prices),
//   counted in the Counter row scan:day:<date>; past it the page says "try again tomorrow".
// - Public later: SCAN_FREE_PER_DAY a signed-in free account (default 5), Premium SCAN_PREMIUM_PER_DAY (default 100).
// - A scan never calls eBay, never spends eBay quota and never writes a price: the price shown is the card's own
//   stored price rows, through the quick view.
export const DEFAULT_SCAN_DAILY_CAP = 300;
export const DEFAULT_SCAN_FREE_PER_DAY = 5;
export const DEFAULT_SCAN_PREMIUM_PER_DAY = 100;
export const SCAN_MAX_IMAGE_BYTES = 1_500_000; // base64 of a ~1,024 px JPEG is ~150-400 KB; anything bigger is refused

function num(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
}

export function scanConfig(env: Record<string, string | undefined> = process.env) {
  return {
    enabled: !!env.ANTHROPIC_API_KEY,
    public: env.SCAN_PUBLIC === "1",
    dailyCap: num(env.SCAN_DAILY_CAP, DEFAULT_SCAN_DAILY_CAP),
    freePerDay: num(env.SCAN_FREE_PER_DAY, DEFAULT_SCAN_FREE_PER_DAY),
    premiumPerDay: num(env.SCAN_PREMIUM_PER_DAY, DEFAULT_SCAN_PREMIUM_PER_DAY),
  };
}

export type ScanAccess = { ok: true; perUserLimit: number | null } | { ok: false; status: 401 | 403 | 404; error: string };

/** Who may scan. Admins always (the beta testers); everyone signed in only once SCAN_PUBLIC=1. */
export function scanAccess(
  cfg: ReturnType<typeof scanConfig>,
  user: { isAdmin: boolean; premium: boolean } | null,
): ScanAccess {
  if (!cfg.enabled) return { ok: false, status: 404, error: "The scanner is not switched on." };
  if (user?.isAdmin) return { ok: true, perUserLimit: null };
  if (!cfg.public) return { ok: false, status: 403, error: "The card scanner is in a private test. It opens to everyone soon." };
  if (!user) return { ok: false, status: 401, error: "Sign in to scan cards: it's free." };
  return { ok: true, perUserLimit: user.premium ? cfg.premiumPerDay : cfg.freePerDay };
}

export function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
