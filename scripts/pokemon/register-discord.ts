// Registers the Pokémon Discord app's slash commands (src/lib/pokemon/discord.ts
// COMMANDS). Run BY HAND, once after creating the app and again whenever the
// commands change; no workflow runs it, so the bot token never has to be stored
// anywhere (docs/pokemon/README.md, "Discord setup"):
//
//   POKEMON_DISCORD_APP_ID=… POKEMON_DISCORD_BOT_TOKEN=… npx tsx scripts/pokemon/register-discord.ts
//
// PUT replaces the app's whole global command set, so re-running is safe and a
// command removed from COMMANDS disappears from Discord. It prints Discord's
// answer and never the token.
import { COMMANDS } from "../../src/lib/pokemon/discord";

async function main() {
  const appId = (process.env.POKEMON_DISCORD_APP_ID ?? "").trim();
  const token = (process.env.POKEMON_DISCORD_BOT_TOKEN ?? "").trim();
  if (!/^\d{5,25}$/.test(appId) || !token) {
    console.error("Set POKEMON_DISCORD_APP_ID (the numeric Application ID) and POKEMON_DISCORD_BOT_TOKEN. See the header of this file.");
    process.exitCode = 1;
    return;
  }
  const url = `https://discord.com/api/v10/applications/${appId}/commands`;
  console.log(`PUT ${url} (${COMMANDS.length} commands: ${COMMANDS.map((c) => `/${c.name}`).join(", ")})`);
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(COMMANDS),
  });
  const body = await res.text();
  console.log(`Discord answered HTTP ${res.status}`);
  console.log(body);
  if (!res.ok) {
    process.exitCode = 1;
    return;
  }
  console.log("Next: set the Interactions Endpoint URL to https://riftcompare.com/api/pokemon/discord in the Developer Portal.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
