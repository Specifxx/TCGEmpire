// Which AI assistant sent this visit? (DECISIONS.md, 2026-11-17.) Pure, so the tracker and its test share it.
const ASSISTANTS: [RegExp, string][] = [
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/i, "chatgpt"],
  [/(^|\.)perplexity\.ai$/i, "perplexity"],
  [/(^|\.)claude\.ai$/i, "claude"],
  [/(^|\.)(gemini\.google\.com|bard\.google\.com)$/i, "gemini"],
  [/(^|\.)(copilot\.microsoft\.com|copilot\.com)$/i, "copilot"],
  [/(^|\.)(you\.com|phind\.com|kagi\.com)$/i, "other-ai"],
  [/(^|\.)(grok\.com|x\.ai)$/i, "grok"],
  [/(^|\.)meta\.ai$/i, "meta-ai"],
  [/(^|\.)(deepseek\.com|chat\.deepseek\.com)$/i, "deepseek"],
  [/(^|\.)mistral\.ai$/i, "mistral"],
];
const UTM: Record<string, string> = { "chatgpt.com": "chatgpt", chatgpt: "chatgpt", perplexity: "perplexity", "perplexity.ai": "perplexity", claude: "claude", gemini: "gemini", copilot: "copilot" };

export function aiSourceOf(referrer: string, utmSource: string | null): string | null {
  const u = (utmSource ?? "").toLowerCase();
  if (u && UTM[u]) return UTM[u];
  try {
    const host = new URL(referrer).hostname;
    for (const [re, name] of ASSISTANTS) if (re.test(host)) return name;
  } catch {}
  return null;
}
