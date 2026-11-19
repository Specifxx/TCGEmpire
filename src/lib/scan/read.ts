// Card scanner, step 1: ONE small vision-model call reads the printed text off a photo of a card.
// No "@/" imports and no Next.js: scripts/scan-eval runs this same function in GitHub Actions.
// DECISIONS.md, 2026-11-19 "Card scanner beta".
//
// Cost: Claude Haiku 5.5 at US$0.10 / US$0.50 per million tokens. The browser sends a JPEG at most 1024 px on the
// long side (~1,100 image tokens), the prompt is ~350 tokens and the answer ~60, so a scan is about US$0.00018
// (5,500 scans per US dollar). SCAN_DAILY_CAP (lib/scan/caps.ts) bounds the day.
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
    thinking: { type: "disabled" },
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

/** US dollars for one call at the model's published price (Haiku 5.5 unless told otherwise). */
export function scanCostUsd(u: { inputTokens: number; outputTokens: number }, model = SCAN_MODEL): number {
  const price: Record<string, [number, number]> = { "claude-haiku-5-5": [0.1, 0.5], "claude-sonnet-5-5": [2, 10] };
  const [i, o] = price[model] ?? [4, 20];
  return (u.inputTokens * i + u.outputTokens * o) / 1e6;
}
