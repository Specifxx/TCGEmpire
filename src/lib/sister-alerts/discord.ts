// The family's ONE Discord hub ("TCG Deals & Restocks", owner 2026-11-20: grow it past 9 members). Each card site
// has its own never-expiring invite code, so the server's Invites list shows how many members each site's alert
// emails bring. Card games only: the hub is a trading-card server, so wargame, sports, figure, scent and K-beauty
// subscribers never see it (the two-sides rule, CLAUDE.md). DECISIONS.md, 2026-11-20.
const INVITES: Partial<Record<string, string>> = {
  dex: "https://discord.gg/n6nc7EQH2D",
  mtg: "https://discord.gg/6pTeNX8Y5k",
  lorcana: "https://discord.gg/SRrMNdKbDp",
  ygo: "https://discord.gg/Dg4qYhAV7X",
  tcgprices: "https://discord.gg/s8YRcSgxRy",
  gundam: "https://discord.gg/cdJEpmuTW2",
  cyberpunk: "https://discord.gg/cdJEpmuTW2",
  bandai: "https://discord.gg/cdJEpmuTW2",
};

export function discordInvite(siteKey: string): string | null {
  return INVITES[siteKey] ?? null;
}
