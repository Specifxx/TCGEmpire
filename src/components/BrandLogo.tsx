// The "R" mark, recoloured from its flat brand-green PNG into a two-tone green
// depth gradient via a CSS mask, so the underlying asset (a single flat colour
// on transparent) stays untouched. Interpolated `in oklch` (not the sRGB
// default) purely for a cleaner ramp between the two greens — no amber/red here:
// the Vendetta homepage block now reserves #e5484d exclusively for Vendetta, so
// the permanent, sitewide nav mark can't also spend that red as decoration. This
// is the site's one deliberate gradient accent — small, decorative, and not
// carrying any data meaning — so no other element should reach for a gradient
// without first removing this one.
export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="RiftCompare logo"
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundImage: "linear-gradient(in oklch, #34d17e, #1ea65c)",
        WebkitMaskImage: "url(/logo-r-green.png)",
        maskImage: "url(/logo-r-green.png)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
