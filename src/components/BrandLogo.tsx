// The swirl "R" mark, in the Riftbound gold-to-orange (2026-10-16 rebrand;
// DECISIONS.md, "The Riftbound rebrand"). A CSS mask over the `--rc-flame`
// gradient (globals.css .rb-mark): the shape is public/brand/r-mark.svg, traced
// from the original logo-r-green.png, so the light theme darkens the gradient
// with one variable and the SVG is fetched once and cached.
//
// The wordmark beside it is live text, as it always was ("Rift" + "Compare",
// mixed case, owner 2026-10-16): only "Compare" changed, from brand green to
// the same gradient (.rb-flame-text). That gradient is the site's decoration
// for the logo and the homepage H1's "Riftbound"; buttons and chips stay flat.
export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return <span role="img" aria-label="RiftCompare logo" className={`rb-mark ${className}`} />;
}
