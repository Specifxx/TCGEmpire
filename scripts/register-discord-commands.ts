/**
 * One-time registration of the RiftCompare Discord bot's slash commands.
 *
 * Setup:
 *   1. discord.com/developers/applications → New Application → "RiftCompare".
 *   2. General Information → copy Application ID and Public Key.
 *   3. Bot tab → Reset Token → copy it.
 *   4. Set env: DISCORD_APP_ID, DISCORD_BOT_TOKEN (and DISCORD_BOT_PUBLIC_KEY in Vercel).
 *   5. Run: DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… npx tsx scripts/register-discord-commands.ts
 *   6. In the app's settings, set Interactions Endpoint URL to
 *      https://riftcompare.com/api/discord/interactions (Discord verifies it live).
 *   7. Install: OAuth2 → URL Generator → scope "applications.commands" (+ "bot",
 *      no permissions needed) → open the URL and add it to any server.
 */
const APP_ID = process.env.DISCORD_APP_ID ?? "";
const TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";

const COMMANDS = [
  {
    name: "price",
    description: "Live lowest price for a Riftbound card across every store RiftCompare tracks",
    options: [
      { type: 3, name: "card", description: "Card name (or part of it)", required: true },
    ],
  },
  {
    name: "movers",
    description: "This week's biggest Riftbound price risers and drops",
  },
];

async function main() {
  if (!APP_ID || !TOKEN) {
    console.error("Set DISCORD_APP_ID and DISCORD_BOT_TOKEN (see the header of this file).");
    process.exit(1);
  }
  const res = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
    method: "PUT", // PUT replaces the full set — idempotent, safe to re-run
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(COMMANDS),
  });
  if (!res.ok) {
    console.error(`Discord API ${res.status}:`, await res.text());
    process.exit(1);
  }
  const data = (await res.json()) as { name: string }[];
  console.log(`✓ Registered ${data.length} commands: ${data.map((c) => `/${c.name}`).join(", ")}`);
  console.log("Now set the Interactions Endpoint URL to https://riftcompare.com/api/discord/interactions");
}

main();
