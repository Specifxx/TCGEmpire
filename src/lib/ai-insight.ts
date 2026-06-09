// AI market insight for a single card — a free "is this worth buying now?" read.
//
// The VERDICT is always computed deterministically from our own price data (so it's
// trustworthy and free). When ANTHROPIC_API_KEY is set, Claude writes a sharper
// natural-language tip grounded in those same signals; otherwise we fall back to a
// rule-based sentence. Either way the section is always populated.
import Anthropic from "@anthropic-ai/sdk";
import type { PricePoint } from "./price-history";
import { formatMoney } from "./format";

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
// Skill default is Opus; override to a cheaper model (e.g. claude-haiku-4-5) via env.
const MODEL = process.env.AI_INSIGHT_MODEL ?? "claude-opus-4-8";

export function aiEnabled(): boolean {
  return Boolean(API_KEY);
}

export type Verdict = "BUY" | "HOLD" | "CAUTION" | "UNKNOWN";
export type Signals = {
  n: number;
  nowCents: number;
  minCents: number;
  maxCents: number;
  posPct: number; // 0 = at its low, 1 = at its high
  trend7: number; // % change vs ~7 days ago
  trend30: number; // % change vs ~30 days ago / oldest
  volatilityPct: number;
};
export type Insight = { verdict: Verdict; label: string; summary: string; source: "ai" | "rules"; signals: Signals };

const LABELS: Record<Verdict, string> = {
  BUY: "Good time to buy",
  HOLD: "Fair price",
  CAUTION: "Pricey right now",
  UNKNOWN: "Not enough data",
};

function nearestTo(points: PricePoint[], targetT: number): PricePoint {
  let best = points[0];
  for (const p of points) if (Math.abs(p.t - targetT) < Math.abs(best.t - targetT)) best = p;
  return best;
}

export function computeSignals(points: PricePoint[]): Signals {
  const n = points.length;
  const now = points[n - 1]?.v ?? 0;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const range = Math.max(1, max - min);
  const nowT = points[n - 1]?.t ?? Date.now();
  const ref7 = nearestTo(points, nowT - 7 * 86400_000);
  const ref30 = nearestTo(points, nowT - 30 * 86400_000);
  const trend7 = ref7.v > 0 ? ((now - ref7.v) / ref7.v) * 100 : 0;
  const trend30 = ref30.v > 0 ? ((now - ref30.v) / ref30.v) * 100 : 0;
  // Volatility = mean absolute day-over-day % move.
  let moves = 0, sum = 0;
  for (let i = 1; i < n; i++) {
    if (points[i - 1].v > 0) { sum += Math.abs((points[i].v - points[i - 1].v) / points[i - 1].v) * 100; moves++; }
  }
  return {
    n,
    nowCents: now,
    minCents: min,
    maxCents: max,
    posPct: (now - min) / range,
    trend7: Math.round(trend7 * 10) / 10,
    trend30: Math.round(trend30 * 10) / 10,
    volatilityPct: moves ? Math.round((sum / moves) * 10) / 10 : 0,
  };
}

// Deterministic per-card seed so each card gets a different line, but the same card
// stays stable within the day (matches the once-a-day cache).
function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

// Funny, varied, signal-grounded fallback "AI" lines — fully free, no LLM. Each
// card draws a different template seeded by its id, with the real numbers woven in.
function ruleVerdict(s: Signals, seedKey: string): { verdict: Verdict; summary: string } {
  const seed = seedFrom(seedKey);
  const now = formatMoney(s.nowCents, "AUD");
  const low = formatMoney(s.minCents, "AUD");
  const high = formatMoney(s.maxCents, "AUD");
  const down7 = s.trend7 < 0 ? ` — down ${Math.abs(s.trend7)}% this week` : "";
  const up7 = s.trend7 > 0 ? ` (up ${s.trend7}% this week)` : "";
  const month = s.trend30 !== 0 ? ` (${s.trend30 > 0 ? "+" : ""}${s.trend30}% over the month)` : "";
  const volTag = s.volatilityPct >= 8 ? ` Fair warning: it's swinging ~${s.volatilityPct}% a day, so blink and the price moves.` : "";

  if (s.n < 4) {
    return {
      verdict: "UNKNOWN",
      summary: pick([
        "Barely any price history on this one — the gremlin is squinting into the fog. Give it a few days.",
        "Not enough data yet to have an opinion, and the gremlin refuses to make things up (today). Check back soon.",
        "The chart's basically a single dot. Come back when this card has a story to tell.",
      ], seed),
    };
  }
  if (s.posPct <= 0.3 || (s.trend7 <= -8 && s.posPct <= 0.6)) {
    return {
      verdict: "BUY",
      summary: pick([
        `${now} and basically in the bargain bin${down7}. The market's gift-wrapping it. Grab it before it remembers its worth. 🪙`,
        `Down at ${now}, hugging its ${low} floor like it's scared of heights. If you wanted it, this is the dip you screenshot later. Buy.`,
        `${now} — cheaper than it's been in a while${down7}. Either everyone forgot this card exists, or you're early. Either way: snag it.`,
        `It's ${now}, slumming near its low${down7}. The kind of price future-you brags about getting. Pull the trigger.`,
      ], seed) + volTag,
    };
  }
  if (s.posPct >= 0.8 || s.trend7 >= 12) {
    return {
      verdict: "CAUTION",
      summary: pick([
        `${now} and flexing near its ${high} ceiling${up7}. Buy here and you're the one holding the top. Let it breathe.`,
        `Strutting at ${now}${up7}, with the confidence of a card that hasn't checked its own chart. Wait for the comedown.`,
        `${now}?? It's mooning${up7}. Chase it now and future-you files a formal complaint. Patience, champ.`,
        `Near record highs at ${now}${up7}. Hot cards cool off — give it a minute before you overpay.`,
      ], seed) + volTag,
    };
  }
  return {
    verdict: "HOLD",
    summary: pick([
      `${now}, cruising in its usual lane${month}. Not a steal, not a scam — just a card being a card. Buy if you need it, shrug if you don't.`,
      `Parked at ${now}${month}. The chart's flatter than week-old soda. Fine price, zero drama.`,
      `${now} and boringly stable${month}. No heroics here — if it's for your deck, grab it; if it's an "investment", lower your expectations.`,
      `Holding steady at ${now}${month}. The gremlin has checked twice and still has nothing spicy to report. It's just fine.`,
    ], seed) + volTag,
  };
}

async function claudeSummary(card: { name: string; rarity: string; setCode: string }, s: Signals, verdict: Verdict): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey: API_KEY });
    const data = [
      `Card: ${card.name} (${card.setCode}, ${card.rarity})`,
      `Current AU price: ${formatMoney(s.nowCents, "AUD")}`,
      `Recent low / high: ${formatMoney(s.minCents, "AUD")} / ${formatMoney(s.maxCents, "AUD")}`,
      `Where current price sits in that range: ${Math.round(s.posPct * 100)}% (0% = at the low)`,
      `Change over 7 days: ${s.trend7}% · over 30 days: ${s.trend30}%`,
      `Day-to-day volatility: ${s.volatilityPct}%`,
      `Our rule-based call: ${verdict}`,
    ].join("\n");
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system:
        "You are RiftCompare's gremlin market oracle for the Riftbound TCG — a chaotic, very online, Grok-style hot-take machine. Given price signals for ONE card, deliver a funny, narrative, slightly unhinged 1–2 sentence verdict on whether to BUY the single right now. Be dramatic, witty and irreverent — crack a joke, paint a tiny scene, roast the price action — but ground EVERYTHING in the actual numbers given and end with a clear lean (buy / hold / wait). Keep it PG-13: no slurs, no hate, no real financial-advice claims, no targeting real people. No preamble, no markdown, no hashtags, no emoji spam (one emoji max), under 50 words. Output the take only.",
      messages: [{ role: "user", content: data }],
    });
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

// Small in-memory cache so we make at most one Claude call per card per day per
// serverless instance (the HTTP layer adds CDN caching on top).
const cache = new Map<string, Insight>();
function dayKey(cardId: string) {
  return `${cardId}:${new Date().toISOString().slice(0, 10)}`;
}

export async function getInsight(card: { id: string; name: string; rarity: string; setCode: string }, points: PricePoint[]): Promise<Insight> {
  const key = dayKey(card.id);
  const hit = cache.get(key);
  if (hit) return hit;

  const signals = computeSignals(points);
  const rule = ruleVerdict(signals, dayKey(card.id));
  let summary = rule.summary;
  let source: "ai" | "rules" = "rules";

  if (aiEnabled() && signals.n >= 4) {
    const ai = await claudeSummary(card, signals, rule.verdict);
    if (ai) { summary = ai; source = "ai"; }
  }

  const insight: Insight = { verdict: rule.verdict, label: LABELS[rule.verdict], summary, source, signals };
  cache.set(key, insight);
  return insight;
}
