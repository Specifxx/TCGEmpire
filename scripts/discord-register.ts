// Registers the Discord price bot's slash commands (lib/discord/bot.ts) as
// global commands. Run by .github/workflows/discord-commands.yml after the
// commands change; registering is idempotent (a bulk overwrite).
//
//   DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN  from the Developer Portal
import { BOT_COMMANDS } from "../src/lib/discord/bot";

async function main() {
  const app = process.env.DISCORD_APPLICATION_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!app || !token) {
    console.log("DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN is not set: nothing to register.");
    return;
  }
  const r = await fetch(`https://discord.com/api/v10/applications/${app}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(BOT_COMMANDS),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Discord refused the commands (${r.status}): ${text.slice(0, 500)}`);
  const names = (JSON.parse(text) as { name: string }[]).map((c) => `/${c.name}`);
  console.log(`Registered ${names.join(", ")}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
