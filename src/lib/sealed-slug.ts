// The URL of a sealed product's own page, /sealed/<slug> (2026-11-03, DECISIONS.md "Sealed products get their own
// pages"). Made from the group key, which is the same in every market ("OGN|Booster Box" → "ogn-booster-box"), so one
// page serves all six markets and a product's URL never moves when its display name or its cheapest store changes.
// Pure, client-safe.

export function sealedSlug(groupKey: string): string {
  return groupKey
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function sealedPath(groupKey: string): string {
  return `/sealed/${sealedSlug(groupKey)}`;
}
