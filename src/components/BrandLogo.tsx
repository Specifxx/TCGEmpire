// RiftCompare's marks, in the Riftbound gold-to-orange (2026-10-16 rebrand;
// DECISIONS.md, "The Riftbound rebrand"). Both are CSS masks over the
// `--rc-flame` gradient (globals.css .rb-mark / .rb-wordmark), so the SVG
// shapes in public/brand/ are fetched once and cached, the light theme darkens
// the gradient with one variable, and no font is loaded for the logo.
//
// The gradient is the site's one decorative gradient besides the H1's
// "Riftbound" (.rb-flame-text), which wears the same one on purpose: together
// they are the logo. Buttons and chips stay flat.

/** The swirl "R" alone: the compact mark (phone header, icons in copy). */
export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return <span role="img" aria-label="RiftCompare logo" className={`rb-mark ${className}`} />;
}

/** The full lockup: the swirl R standing in for the R of "RIFT COMPARE", as
 *  the owner's mockup draws it. Size it by height; the width follows the
 *  artwork's aspect ratio. */
export function BrandWordmark({ className = "h-7" }: { className?: string }) {
  return <span role="img" aria-label="RiftCompare" className={`rb-wordmark ${className}`} />;
}
