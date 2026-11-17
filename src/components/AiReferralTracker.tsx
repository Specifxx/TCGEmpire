"use client";
// AI-assistant referrals (DECISIONS.md, 2026-11-17): once per session, a visit from ChatGPT, Perplexity, Claude, Gemini,
// Copilot and the like (referrer, or ChatGPT's utm_source=chatgpt.com) is sent as the custom event "ai_referral"
// (assistant, landing path). Low volume by nature. Nothing is stored beyond sessionStorage.
import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { aiSourceOf } from "@/lib/ai-referral";

export function AiReferralTracker() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("ai_source")) return;
      const src = aiSourceOf(document.referrer, new URLSearchParams(location.search).get("utm_source"));
      if (!src) return;
      sessionStorage.setItem("ai_source", src);
      trackEvent("ai_referral", { assistant: src, page: location.pathname.slice(0, 80) });
    } catch {}
  }, []);
  return null;
}
