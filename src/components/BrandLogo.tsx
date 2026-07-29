// The "R" mark, recoloured from its flat brand-green PNG into a green → amber →
// red heat-scale gradient (Calm/Fury — Vendetta's own rivalry palette) via a CSS
// mask, so the underlying asset (a single flat colour on transparent) stays
// untouched. Interpolated `in oklch` (not the sRGB default) so the amber
// midpoint stays bright instead of curdling into the muddy olive an sRGB
// green→red lerp produces. This is the site's one deliberate gradient accent —
// small, decorative, and not carrying any data meaning — so no other element
// should reach for a gradient without first removing this one.
export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="RiftCompare logo"
      className={`inline-block shrink-0 ${className}`}
      style={{
        backgroundImage: "linear-gradient(in oklch, #1ea65c, #f5a524, #e5484d)",
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
