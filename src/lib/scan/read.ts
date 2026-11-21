// Card scanner, step 1: ONE small vision-model call reads the printed text off a photo of a card.
// No "@/" imports and no Next.js: scripts/scan-eval runs this same function in GitHub Actions.
// DECISIONS.md, 2026-11-19 "Card scanner beta".
//
// Cost: Claude Haiku 5.5 at US$0.10 / US$0.50 per million tokens. The browser sends a JPEG at most 1024 px on the
// long side. Measured (scan-eval run 3, 588 images): US$0.0003 a scan on average including the picture check that
// about one scan in six needs, so about 3,300 scans per US dollar. SCAN_DAILY_CAP (lib/scan/caps.ts) bounds the day.
import Anthropic from "@anthropic-ai/sdk";
import type { ScanReading } from "./match";

export const SCAN_MODEL = "claude-haiku-5-5";

const SYSTEM = [
  "You read trading cards from phone photos for a price comparison site.",
  "Report only text you can actually see on the card. Never guess a number or a name you cannot read: use null.",
  "Riftbound (League of Legends Trading Card Game) cards print the card name at the top (champion units read like",
  '"Jinx, Loose Cannon") and, along the bottom edge, a set code and collector number such as "OGN · 066/298",',
  '"SFD · 104a/221" or "OGN · 299*/298". Set codes include OGN, OGS, SFD, UNL, VEN, RAD.',
  "Battlefield cards are printed sideways (landscape); read them in whatever orientation the text runs.",
  "promoStamp is true only if you can see a promo, event or prerelease stamp or the word PROMO on the card.",
  "If the photo shows the back of a card, several cards, or no card, set isTradingCard accordingly and leave the rest null.",
].join("\n");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isTradingCard", "game", "name", "setCode", "collectorNumber", "promoStamp", "language"],
  properties: {
    isTradingCard: { type: "boolean", description: "true if the front of exactly one trading card is visible" },
    game: { type: ["string", "null"], description: 'lower-case game name, e.g. "riftbound", "pokemon", "magic", "one piece", "yugioh"' },
    name: { type: ["string", "null"], description: "the card name exactly as printed" },
    setCode: { type: ["string", "null"], description: "the set code letters printed near the collector number" },
    collectorNumber: { type: ["string", "null"], description: 'as printed, e.g. "066/298" or "104a/221"' },
    promoStamp: { type: "boolean" },
    language: { type: ["string", "null"], description: "ISO 639-1 code of the card's printed language" },
  },
} as const;

export interface ReadResult {
  reading: ScanReading & { language: string | null };
  usage: { inputTokens: number; outputTokens: number };
  ms: number;
}

/** imageBase64: a JPEG, no data: prefix. Throws on an API error; returns isTradingCard false on a refusal. */
export async function readCard(client: Anthropic, imageBase64: string, opts: { model?: string } = {}): Promise<ReadResult> {
  const t0 = Date.now();
  const res = await client.messages.create({
    model: opts.model ?? SCAN_MODEL,
    max_tokens: 400,
    // Reading printed text needs no reasoning; thinking off keeps a scan near one second.
    thinking: thinkingOff(opts.model ?? SCAN_MODEL),
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: "Read this card." },
        ],
      },
    ],
  });
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  const empty = { isTradingCard: false, game: null, name: null, setCode: null, collectorNumber: null, promoStamp: false, language: null };
  if (res.stop_reason === "refusal") return { reading: empty, usage, ms: Date.now() - t0 };
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: Partial<typeof empty> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    return { reading: empty, usage, ms: Date.now() - t0 };
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
  return {
    reading: {
      isTradingCard: parsed.isTradingCard === true,
      game: str(parsed.game)?.toLowerCase() ?? null,
      name: str(parsed.name),
      setCode: str(parsed.setCode),
      collectorNumber: str(parsed.collectorNumber),
      promoStamp: parsed.promoStamp === true,
      language: str(parsed.language),
    },
    usage,
    ms: Date.now() - t0,
  };
}

// ── Any game (sister sites: TCG Singles DB; lib/scan/sister.ts) ─────────────────────────────────────────────────
// Same single call and price; the prompt names how each game prints its name and number, and asks for the
// 1st Edition stamp (Pokémon and Yu-Gi-Oh! price it as its own printing). The sister site does the matching.
const ANY_SYSTEM = [
  "You read trading cards from phone photos for a price guide.",
  "Report only text you can actually see on the card. Never guess a number or a name you cannot read: use null.",
  "The collector number and set code are small: if you cannot read every character, set collectorNumber to null rather than",
  "writing a typical or likely code. A wrong number is worse than none.",
  'Pokémon cards print the name at the top and a collector number at the bottom, e.g. "058/107", "TG05/TG30", "SWSH123" or "SVP 045";',
  'newer cards also print a small set code like "SVI" or "PAL" beside it. Black Star promos print only a promo number such as',
  '"BW87", "XY121", "SM23", "SWSH110" or "SVP 045" (no total): give it whole, letters included. Give the name without the HP.',
  'Yu-Gi-Oh! cards print the name at the top and a set number just under the bottom-right corner of the artwork, e.g. "GLD3-EN023",',
  '"DL1-001" or "RA01-EN054": put that whole code in collectorNumber.',
  'One Piece cards print the name in the bottom panel and a number like "OP01-120", "ST10-005", "EB01-012" or "P-041";',
  "put that code in collectorNumber.",
  "Other games: the name as printed and the collector number as printed.",
  "firstEdition is true only if a 1st Edition stamp or the words 1st Edition are visible.",
  "promoStamp is true only if you can see a promo, event, prerelease or staff stamp or the word PROMO.",
  "If the photo shows the back of a card, several cards, or no card, set isTradingCard accordingly and leave the rest null.",
].join("\n");

const ANY_SCHEMA = {
  ...SCHEMA,
  required: [...SCHEMA.required, "firstEdition"],
  properties: { ...SCHEMA.properties, firstEdition: { type: "boolean" } },
} as const;

export interface AnyReadResult {
  reading: ReadResult["reading"] & { firstEdition: boolean };
  usage: ReadResult["usage"];
  ms: number;
}

/** gameHint: the game the visitor picked on the sister's page (a slug, e.g. "pokemon"), or null. */
export async function readAnyCard(client: Anthropic, imageBase64: string, gameHint: string | null, opts: { model?: string } = {}): Promise<AnyReadResult> {
  const t0 = Date.now();
  const model = opts.model ?? SCAN_MODEL;
  const res = await client.messages.create({
    model,
    max_tokens: 400,
    thinking: thinkingOff(model),
    output_config: { effort: "low", format: { type: "json_schema", schema: ANY_SCHEMA as unknown as Record<string, unknown> } },
    system: ANY_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
          { type: "text", text: gameHint ? `Read this card. The visitor says it is a ${gameHint.replace(/-/g, " ")} card.` : "Read this card." },
        ],
      },
    ],
  });
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  const empty = { isTradingCard: false, game: null, name: null, setCode: null, collectorNumber: null, promoStamp: false, language: null, firstEdition: false };
  if (res.stop_reason === "refusal") return { reading: empty, usage, ms: Date.now() - t0 };
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(res.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  } catch {
    return { reading: empty, usage, ms: Date.now() - t0 };
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null);
  return {
    reading: {
      isTradingCard: parsed.isTradingCard === true,
      game: str(parsed.game)?.toLowerCase() ?? null,
      name: str(parsed.name),
      setCode: str(parsed.setCode),
      collectorNumber: str(parsed.collectorNumber),
      promoStamp: parsed.promoStamp === true,
      language: str(parsed.language),
      firstEdition: parsed.firstEdition === true,
    },
    usage,
    ms: Date.now() - t0,
  };
}

/** "Thinking off" is spelled differently per model: Sonnet 5.5 refuses `disabled` and takes `between_tools`. */
export function thinkingOff(model: string): Anthropic.ThinkingConfigParam {
  return (model.startsWith("claude-sonnet-5-5") ? { type: "between_tools" } : { type: "disabled" }) as Anthropic.ThinkingConfigParam;
}

const TWIN_SYSTEM = [
  "You compare a phone photo of one trading card with official images of several printings of that same card.",
  "The printings differ in artwork, frame, foil treatment, a promo stamp, a signature or the collector number's letter or star.",
  "Pick the official image that shows the same printing as the photo. Ignore glare, angle, lighting and the photo's background.",
  "If two images look identical, or you cannot tell, set sure to false.",
].join("\n");

const TWIN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["choice", "sure"],
  properties: {
    choice: { type: "integer", description: "the number of the matching official image (1-based), or 0 if none matches" },
    sure: { type: "boolean" },
  },
} as const;

/**
 * Step 1b, only when the printed number points at printings with DIFFERENT pictures (a promo with its own art, an
 * alt art read without its letter, an overnumbered star): one more call with the photo and up to four official images
 * (fetched by Anthropic from their URLs). Returns the index into `images` or null when not sure.
 */
export async function pickTwin(
  client: Anthropic,
  imageBase64: string,
  images: string[],
  opts: { model?: string } = {},
): Promise<{ index: number | null; usage: { inputTokens: number; outputTokens: number }; ms: number }> {
  const t0 = Date.now();
  const model = opts.model ?? SCAN_MODEL;
  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: "Photo:" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
  ];
  images.slice(0, 4).forEach((url, i) => {
    content.push({ type: "text", text: `Official image ${i + 1}:` });
    content.push({ type: "image", source: { type: "url", url } });
  });
  content.push({ type: "text", text: "Which official image is the same printing as the photo?" });
  const res = await client.messages.create({
    model,
    max_tokens: 200,
    thinking: thinkingOff(model),
    output_config: { effort: "low", format: { type: "json_schema", schema: TWIN_SCHEMA as unknown as Record<string, unknown> } },
    system: TWIN_SYSTEM,
    messages: [{ role: "user", content }],
  });
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  let index: number | null = null;
  if (res.stop_reason !== "refusal") {
    try {
      const p = JSON.parse(res.content.map((b) => (b.type === "text" ? b.text : "")).join("")) as { choice?: number; sure?: boolean };
      if (p.sure === true && Number.isInteger(p.choice) && p.choice! >= 1 && p.choice! <= Math.min(4, images.length)) index = p.choice! - 1;
    } catch {
      /* not sure */
    }
  }
  return { index, usage, ms: Date.now() - t0 };
}

/** US dollars for one call at the model's published price (Haiku 5.5 unless told otherwise). */
export function scanCostUsd(u: { inputTokens: number; outputTokens: number }, model = SCAN_MODEL): number {
  const price: Record<string, [number, number]> = { "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10] };
  const [i, o] = price[model] ?? [4, 20];
  return (u.inputTokens * i + u.outputTokens * o) / 1e6;
}
