// The "R" mark, recoloured from its flat brand-green PNG into a green→red
// gradient (Calm/Fury — Vendetta's own rivalry palette) via a CSS mask, so the
// underlying asset (a single flat colour on transparent) stays untouched.
export function BrandLogo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="RiftCompare logo"
      className={`inline-block shrink-0 bg-gradient-to-br from-[#30a46c] to-[#e5484d] ${className}`}
      style={{
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
