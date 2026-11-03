// Finishes and keeps the Discord price bot set up (lib/discord/bot.ts), run
// daily by .github/workflows/discord-commands.yml (DECISIONS.md, "Discord
// price bot", 2026-10-27; 2026-11-03 "set-up finishes itself"):
//
// 1. Registers the slash commands as global commands (a bulk overwrite, so
//    idempotent).
// 2. Once the site's endpoint reports its DISCORD_PUBLIC_KEY (GET
//    /api/discord/interactions → configured: true, i.e. after the next release
//    following the owner's one-time setup), points the application's
//    Interactions Endpoint URL at it, unless it already does. Discord checks the
//    URL with a signed PING when it is set; a refusal fails the run red.
//
// So the owner's part is only creating the app and pasting three values: no
// manual release, no second sitting in the Developer Portal.
//
//   DISCORD_APPLICATION_ID, DISCORD_BOT_TOKEN  from the Developer Portal
import { BOT_COMMANDS } from "../src/lib/discord/bot";

export const INTERACTIONS_URL = "https://riftcompare.com/api/discord/interactions";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** What step 2 should do, from the endpoint's status and the app's current URL. Pure, for the tests. */
export function endpointAction(configured: boolean, current: string | null | undefined): "wait" | "keep" | "set" {
  if (!configured) return "wait";
  return current === INTERACTIONS_URL ? "keep" : "set";
}

export async function run(env: Record<string, string | undefined>, f: Fetch, log: (s: string) => void): Promise<void> {
  const app = env.DISCORD_APPLICATION_ID;
  const token = env.DISCORD_BOT_TOKEN;
  if (!app || !token) {
    log("DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN is not set: nothing to do (a green no-op until the owner's setup).");
    return;
  }
  const auth = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
  const r = await f(`https://discord.com/api/v10/applications/${app}/commands`, { method: "PUT", headers: auth, body: JSON.stringify(BOT_COMMANDS) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Discord refused the commands (${r.status}): ${text.slice(0, 500)}`);
  log(`Registered ${(JSON.parse(text) as { name: string }[]).map((c) => `/${c.name}`).join(", ")}.`);
  // The application id is public: the install link is what the sites' "Add to Discord" buttons use.
  log(`Install link: https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(app)}`);

  let configured = false;
  try {
    const s = await f(`${INTERACTIONS_URL}?t=${Date.now()}`);
    configured = s.ok && Boolean(((await s.json()) as { configured?: boolean }).configured);
  } catch {}
  const me = await f("https://discord.com/api/v10/applications/@me", { headers: auth });
  if (!me.ok) throw new Error(`Discord refused to read the application (${me.status}).`);
  const current = ((await me.json()) as { interactions_endpoint_url?: string | null }).interactions_endpoint_url;
  const action = endpointAction(configured, current);
  if (action === "wait") return log("The site's endpoint has no DISCORD_PUBLIC_KEY yet (it arrives with the next release): the Interactions URL waits.");
  if (action === "keep") return log("The Interactions Endpoint URL already points at the site.");
  const p = await f("https://discord.com/api/v10/applications/@me", { method: "PATCH", headers: auth, body: JSON.stringify({ interactions_endpoint_url: INTERACTIONS_URL }) });
  if (!p.ok) throw new Error(`Discord refused the Interactions Endpoint URL (${p.status}): ${(await p.text()).slice(0, 300)}. Check DISCORD_PUBLIC_KEY in Vercel matches the Developer Portal.`);
  log("Set the Interactions Endpoint URL: the bot now answers.");
}

if (process.argv[1]?.endsWith("discord-register.ts")) {
  run(process.env, (u, i) => fetch(u, i), console.log).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
