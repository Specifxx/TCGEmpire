// Pure, dependency-free formatting — split out of lib/premium.ts (which imports
// the Prisma client and so can't be imported from "use client" components like
// SignupPromoPopup). lib/premium.ts re-exports this so there's still one source
// of truth. Mirrors the lib/marketplace-countries.ts split.

// Human-readable label for a day count ("a week", "2 weeks", "10 days", "1 day").
export function formatPremiumDuration(days: number): string {
  if (days % 7 === 0 && days > 0) {
    const weeks = days / 7;
    return weeks === 1 ? "a week" : `${weeks} weeks`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}
