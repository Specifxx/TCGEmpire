import { NextResponse } from "next/server";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { getPokemonCatalog, getPokemonProduct } from "@/lib/pokemon/data";
import {
  INTERACTION,
  RESPONSE,
  autocompleteProducts,
  autocompleteSets,
  fallbackReply,
  focusedOption,
  interactionContext,
  optionValue,
  parseMarket,
  parsePerPackKind,
  perPackReply,
  resolveProduct,
  resolveSet,
  sealedReply,
  setReply,
  verifyDiscordRequest,
  type DiscordInteraction,
  type DiscordReply,
} from "@/lib/pokemon/discord";
import type { Country } from "@/lib/country";

// The Pokémon Discord app's Interactions Endpoint (docs/pokemon/README.md,
// "Discord setup"). HTTP interactions: no gateway connection, so it runs as an
// ordinary serverless function and needs no bot permissions in a server.
//
// Order matters. Off (no section, or no POKEMON_DISCORD_PUBLIC_KEY) → 404, so
// the URL says nothing until the owner sets it up. Then the signature over the
// RAW body, before any JSON parse or data read: an unsigned request costs
// nothing. Only then the two self-cached loaders, and only with a slug the
// catalogue already holds (lib/pokemon/discord.ts resolveProduct).
//
// Discord drops an answer that takes longer than three seconds, so every read
// races a 2.5 s deadline and a cold lambda answers with a short "try again"
// rather than nothing. The import workflow's warm step keeps the US catalogue
// hot after each purge.
export const runtime = "nodejs"; // node:crypto for Ed25519
export const dynamic = "force-dynamic";

const DEADLINE_MS = 2500;
const TIMED_OUT = Symbol("timed out");

function within<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

async function answer(command: string, market: Country, interaction: DiscordInteraction): Promise<DiscordReply> {
  if (command === "sealed") {
    // Names and slugs are the same in every market, so the US catalogue resolves them.
    const tile = resolveProduct(await getPokemonCatalog("US"), optionValue(interaction, "product"));
    if (!tile) return fallbackReply("not found");
    if (process.env.NODE_ENV === "development") console.info("[pokemon-discord] product read", tile.slug);
    const detail = await getPokemonProduct(tile.slug);
    return detail ? sealedReply(detail, market) : fallbackReply("not found");
  }
  if (command === "perpack") {
    const kind = parsePerPackKind(optionValue(interaction, "kind"));
    return kind ? perPackReply(await getPokemonCatalog(market), kind) : fallbackReply("not found");
  }
  if (command === "set") {
    const catalog = await getPokemonCatalog(market);
    const set = resolveSet(catalog, optionValue(interaction, "name"));
    return set ? setReply(catalog, set.slug) : fallbackReply("not found");
  }
  return fallbackReply("unknown");
}

export async function POST(req: Request) {
  const publicKey = process.env.POKEMON_DISCORD_PUBLIC_KEY;
  if (!pokemonEnabled() || !publicKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = await req.text();
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  if (!verifyDiscordRequest(raw, signature, timestamp, publicKey)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(raw) as DiscordInteraction;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (interaction.type === INTERACTION.PING) return NextResponse.json({ type: RESPONSE.PONG });

  if (interaction.type === INTERACTION.AUTOCOMPLETE) {
    const focused = focusedOption(interaction);
    const typed = (focused?.value ?? "").slice(0, 100);
    const work = getPokemonCatalog("US").then((c) =>
      interaction.data?.name === "set" ? autocompleteSets(c, typed) : autocompleteProducts(c, typed),
    );
    const choices = await within(work, DEADLINE_MS).catch(() => TIMED_OUT);
    return NextResponse.json({ type: RESPONSE.AUTOCOMPLETE_RESULT, data: { choices: choices === TIMED_OUT ? [] : choices } });
  }

  if (interaction.type === INTERACTION.COMMAND) {
    const command = String(interaction.data?.name ?? "");
    const market = parseMarket(optionValue(interaction, "market"));
    // For debugging only: no user, server or channel id, and never what was typed.
    console.info("[pokemon-discord]", { command, market, context: interactionContext(interaction) });
    const reply = await within(answer(command, market, interaction), DEADLINE_MS).catch((e) => {
      console.error("[pokemon-discord] read failed", e);
      return fallbackReply("error");
    });
    return NextResponse.json(reply === TIMED_OUT ? fallbackReply("timeout") : reply);
  }

  return NextResponse.json(fallbackReply("unknown"));
}
