import { NextResponse } from "next/server";
import { z } from "zod";
import { llmText, aiEnabled } from "@/lib/ai-insight";
import { tradeGremlin } from "@/lib/trade-gremlin";
import { formatMoney } from "@/lib/format";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({
  giveCents: z.number().int().min(0).max(100_000_00),
  getCents: z.number().int().min(0).max(100_000_00),
  // Strict enum — an arbitrary string would make Intl throw inside formatMoney.
  currency: z.enum(["AUD", "NZD", "USD", "GBP"]).default("AUD"),
  yours: z.array(z.string().max(80)).max(40).default([]),
  theirs: z.array(z.string().max(80)).max(40).default([]),
});

const SYSTEM =
  "You are RiftCompare's gremlin trade referee for the Riftbound TCG — a chaotic, very online, protective hype-man. Given the two sides of a card trade and their total values, deliver a funny, narrative, slightly unhinged 1–2 sentence verdict on whether it's fair. If the user is getting ripped off, get protective and dramatic — joke like 'are they trying to scam my boy??'. If the user is winning, gleefully call it highway robbery. If it's even, say so with mock disappointment. Ground EVERYTHING in the values given and end with a clear lean (take it / push for more / walk away). PG-13: no slurs, no hate, no real financial advice, no targeting real people. No preamble, no markdown, one emoji max, under 55 words. Output the take only.";

export async function POST(req: Request) {
  // Each roast can be an LLM call — cap per IP so the free quota can't be drained.
  const rl = rateLimit(`roast:${clientIp(req)}`, 6, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { giveCents, getCents, currency, yours, theirs } = parsed.data;

  const rule = tradeGremlin(giveCents, getCents, currency);

  if (aiEnabled()) {
    const user = [
      `You give (${formatMoney(giveCents, currency)}): ${yours.join(", ") || "(nothing)"}`,
      `You receive (${formatMoney(getCents, currency)}): ${theirs.join(", ") || "(nothing)"}`,
      `Net difference in your favour: ${formatMoney(getCents - giveCents, currency)}`,
    ].join("\n");
    const text = await llmText(SYSTEM, user);
    if (text) return NextResponse.json({ text, tone: rule?.tone ?? "fair", source: "ai" });
  }

  return NextResponse.json({ text: rule?.line ?? null, tone: rule?.tone ?? "fair", source: "rules" });
}
