// "Should I grade this card?" expected-value model. High-intent, high-value
// question that today is answered only by editorial rules of thumb (the "3×
// rule", "under $50 don't bother", "a 9 is worth ~30–50% of a 10"). This turns
// those heuristics into a transparent calculator — honest about the one input
// that's genuinely subjective (your odds of a gem-mint 10), which stays a
// user-controlled slider rather than fake precision.
//
// Pure arithmetic, all cents in one market currency. Grading is billed in USD;
// the caller passes a grading cost already in the display currency.

export interface GradeEvInput {
  rawCents: number; // what the card is worth raw, right now
  psa10Cents: number; // expected value as a PSA/CGC 10
  psa9Cents: number; // expected value as a 9 (partial upside)
  oddsOf10: number; // 0..1 — user's estimated chance of a 10
  oddsOf9: number; // 0..1 — chance of a 9 (rest ≈ raw/loss)
  gradingCostCents: number; // all-in grading cost in the display currency
}

export interface GradeEvResult {
  evGradedCents: number; // expected value after grading, net of cost
  upliftCents: number; // evGraded − raw (what grading is worth to you)
  upliftPct: number; // uplift / raw
  verdict: "grade" | "borderline" | "skip";
  reason: string;
}

// A card must clear grading cost AND a margin of safety to be worth the time,
// risk and money. We use the community "3× rule" spirit: meaningful uplift, not
// a coin-flip. Thresholds are on the uplift over raw.
export function computeGradeEv(input: GradeEvInput): GradeEvResult {
  const raw = Math.max(0, input.rawCents);
  const p10 = clamp01(input.oddsOf10);
  const p9 = clamp01(input.oddsOf9);
  const pOther = Math.max(0, 1 - p10 - p9);

  // Expected sale value across outcomes, minus the grading cost you pay regardless.
  const evGross = p10 * input.psa10Cents + p9 * input.psa9Cents + pOther * raw;
  const evGraded = Math.round(evGross - input.gradingCostCents);
  const uplift = evGraded - raw;
  const upliftPct = raw > 0 ? uplift / raw : 0;

  let verdict: GradeEvResult["verdict"];
  let reason: string;
  if (raw > 0 && raw < 2000) {
    // Under ~$20 raw, grading cost + risk almost never pays — a hard floor.
    verdict = uplift > raw * 0.6 ? "borderline" : "skip";
    reason =
      verdict === "skip"
        ? "This card is cheap enough raw that grading cost usually eats the upside."
        : "Low-value card — only worth grading if you're confident of a 10 and it's a chase card.";
  } else if (upliftPct >= 0.6) {
    verdict = "grade";
    reason = "Expected graded value clears the grading cost with a healthy margin.";
  } else if (upliftPct >= 0.15) {
    verdict = "borderline";
    reason = "The math is positive but thin — sensitive to your odds and the grading turnaround.";
  } else {
    verdict = "skip";
    reason = "After grading cost and gem-rate odds, you're not meaningfully ahead of selling raw.";
  }

  return { evGradedCents: evGraded, upliftCents: uplift, upliftPct, verdict, reason };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
