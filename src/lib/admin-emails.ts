// Moderator emails (override via ADMIN_EMAILS env, comma-separated). These accounts
// get delete-any privileges. Not surfaced anywhere in the UI.
//
// Its own dependency-free module (2026-09-25) so the price-alert cron and its
// node tests can read the same list as the session (lib/auth.ts) without
// importing next/headers: an env-listed admin is entitled everywhere the
// session says so, including when the alert cron decides who gets paid alerts.
// georgelu721@gmail.com added 2026-10-16 (owner: "Make georgelu721@gmail.com an admin").
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "mastermisclick@gmail.com,bill.jyang101@gmail.com,georgelu721@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

// Who is "the team" for the giveaways (rule 3: people who run the sites and their household can't win). Every admin,
// plus the company mailboxes, which can hold an account without being an admin (2026-11-27: an owner account was seen
// entered on a sister giveaway). Left out of every draw, the public leaderboard and the entrant counts.
const GIVEAWAY_TEAM_EXTRA = ["compareempire@gmail.com", "riftcompare@gmail.com"];

export function isGiveawayTeamEmail(email: string | null | undefined): boolean {
  return isAdminEmail(email) || (!!email && GIVEAWAY_TEAM_EXTRA.includes(email.toLowerCase()));
}
