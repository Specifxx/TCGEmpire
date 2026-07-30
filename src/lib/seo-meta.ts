// Shared <title>/meta-description budget + builders for every route that
// generates its own metadata (card, guides, blog, sets, champions). Centralised
// so the ~60/~155 char caps (Google's SERP truncation points) are enforced in
// ONE testable place instead of re-implemented — and re-forgotten — per route.
//
// Two different integration shapes exist across the site:
//  - /card/[id] returns a bare title string and lets the ROOT layout's
//    `title.template` ("%s — RiftCompare") append the sitewide suffix — use
//    `buildTemplatedTitle` there.
//  - Every other route (guides/blog/sets/champions) bypasses that template by
//    returning `title: { absolute }` with its OWN suffix baked in — use
//    `buildTitle` there. Mixing the two up double-suffixes a title.
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

// Clamp free text to `max` chars without cutting mid-word, ending in an
// ellipsis when trimmed. Cuts to `max - 1` (not `max`) so the appended "…"
// itself can never push the result over budget. `lastSpace > max * 0.6` avoids
// leaving a stub of only a few words when the nearest space is far from the
// cut point.
export function clampText(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, Math.max(0, max - 1));
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

// Picks the richest (first) candidate that already fits `max`; if even the
// last (shortest/plainest) candidate overflows, clamps it rather than ever
// emitting something over budget.
function bestFit(candidates: string[], max: number): string {
  const fit = candidates.find((c) => c.length <= max);
  if (fit) return fit;
  return clampText(candidates[candidates.length - 1], max);
}

// `candidates` should be ordered richest/longest-first, plainest-last — every
// call site builds a ladder of decreasing detail (or a single-element array
// for hand-authored copy like guide/blog excerpts) so this never has to
// mid-word-truncate a sentence that had a shorter, still-meaningful phrasing
// available.
export function buildDescription(candidates: string[], max = DESCRIPTION_MAX): string {
  return bestFit(candidates, max);
}

// For routes that bypass the root layout's title template (they build their
// own "{content} | RiftCompare"-style suffix). Always returns `{ absolute }`:
// with the suffix when content+suffix fits, content alone when it doesn't —
// never silently truncated by the SERP.
export function buildTitle(candidates: string[], suffix: string, max = TITLE_MAX): { absolute: string } {
  const withSuffix = candidates.find((c) => c.length + suffix.length <= max);
  if (withSuffix) return { absolute: `${withSuffix}${suffix}` };
  return { absolute: bestFit(candidates, max) };
}

// For /card/[id] specifically, which relies on the ROOT layout's
// `title.template` ("%s — RiftCompare") to append the sitewide suffix
// automatically. Returns a bare string (template appends the suffix) when
// content+suffix fits within budget; otherwise returns `{ absolute }` to skip
// the template/suffix rather than let it push the total over budget.
export function buildTemplatedTitle(
  candidates: string[],
  suffix: string,
  max = TITLE_MAX,
): string | { absolute: string } {
  const bareThatFitsWithSuffix = candidates.find((c) => c.length + suffix.length <= max);
  if (bareThatFitsWithSuffix) return bareThatFitsWithSuffix;
  return { absolute: bestFit(candidates, max) };
}
