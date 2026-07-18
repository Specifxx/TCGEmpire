/**
 * Hits the live marketplace-maintenance cron endpoint with CRON_SECRET and
 * confirms it's accepted (200) — the exact request marketplace-maintenance.yml
 * makes every 6h. Safe to run any time: the route's jobs are bounded,
 * idempotent maintenance queries, not a destructive one-off action.
 */
export {};

async function main() {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    console.error("CRON_SECRET is not set as a GitHub Actions secret.");
    process.exit(1);
  }
  const res = await fetch("https://riftcompare.com/api/cron/marketplace-maintenance", {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}: ${text}`);
  if (!res.ok) {
    console.error("CRON_SECRET did not authenticate against the live endpoint — check it matches the Vercel env var exactly.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Cron secret test FAILED:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
