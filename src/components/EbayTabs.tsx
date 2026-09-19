"use client";

import { SegmentedTabs, type SegmentedTab } from "./ui/SegmentedTabs";

/** @deprecated Use SegmentedTab from ./ui/SegmentedTabs — kept as an alias so
 * every existing `import { EbayTab } from "./EbayTabs"` keeps compiling. */
export type EbayTab = SegmentedTab;

/**
 * The tab shell for the card page's and QuickView's eBay panels.
 *
 * Thin wrapper over ui/SegmentedTabs (which this component's own WAI-ARIA
 * implementation — tablist/tab/tabpanel, roving tabindex, Left/Right/Home/End
 * — was lifted out of, so PopularCardsCarousel could adopt the same pattern
 * instead of its own `aria-pressed` button row). Uncontrolled: this caller
 * never needs to know which tab is active, so SegmentedTabs manages that
 * internally.
 *
 * Tabs with no content are dropped by the CALLER, not hidden here — a tab
 * that renders an empty panel is worse than one that never existed, and only
 * the caller knows whether "no graded listings" means empty or still
 * loading.
 */
export function EbayTabs({
  tabs,
  label,
  active,
  onActiveChange,
  className,
}: {
  tabs: EbayTab[];
  label: string;
  /** Controlled active tab. Omit both of these for the uncontrolled default
   *  (first tab), which is what an ordinary card wants. A caller passes them
   *  when the RIGHT tab to open on depends on data that only settles after
   *  hydration — see EbayCardPanelLive, where the Graded tab does not even
   *  exist until the visitor's market is known. */
  active?: string;
  onActiveChange?: (key: string) => void;
  className?: string;
}) {
  return (
    <SegmentedTabs
      tabs={tabs}
      label={label}
      active={active}
      onActiveChange={onActiveChange}
      className={className}
    />
  );
}
