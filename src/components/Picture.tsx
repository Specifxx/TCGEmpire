import { optimisedImage } from "@/lib/image-manifest";

interface Props {
  /** Site-absolute path ("/vendetta-hero.png") or a riftcompare.com URL. */
  src: string;
  /** Descriptive alt text. Pass "" ONLY for genuinely decorative images. */
  alt: string;
  className?: string;
  /** Rendered-width hint for the browser's srcset selection. */
  sizes?: string;
  /** Set on the LCP image only — eager + high fetch priority, never lazy. */
  priority?: boolean;
  /** Overrides for intrinsic dimensions when the manifest has no entry. */
  width?: number;
  height?: number;
  /** Extra classes for the outer <picture>. */
  wrapperClassName?: string;
}

/**
 * A static image from public/, served as WebP with the original as fallback.
 *
 * WHY NOT next/image: every image this renders is a build-time asset we already
 * optimise ourselves (scripts/optimize-images.ts writes the .webp, the narrower
 * renditions and the intrinsic dimensions into public/image-manifest.json). Going
 * through the Next/Vercel image optimiser instead would re-do that work per
 * request, meter against the deployment's image-optimisation quota, and add a
 * cold-start on first view — for output we can produce once at build time and
 * serve from the CDN as plain static files. next/image's real wins (format
 * negotiation, srcset, explicit dimensions, lazy loading) are all reproduced
 * here from the manifest.
 *
 * Everything it emits is what the Lighthouse/SEO audits check for: a modern
 * format with a fallback, a responsive srcset + sizes, explicit width/height so
 * the layout never shifts, and lazy+async decoding below the fold.
 */
export function Picture({
  src,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 768px",
  priority = false,
  width,
  height,
  wrapperClassName,
}: Props) {
  const meta = optimisedImage(src);
  const w = meta?.width ?? width;
  const h = meta?.height ?? height;

  // Widest-last srcset across the generated renditions plus the full-size WebP.
  const webpSrcSet = meta?.webp
    ? [...(meta.variants ?? []).map((v) => `${v.src} ${v.w}w`), `${meta.webp} ${meta.width}w`].join(", ")
    : null;

  const loading = priority ? ("eager" as const) : ("lazy" as const);

  return (
    // Source order is the negotiation order: AVIF (smallest) → WebP → the
    // optimised original in <img>, which every browser can render.
    <picture className={wrapperClassName}>
      {meta?.avif && <source type="image/avif" srcSet={meta.avif} />}
      {webpSrcSet && <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        {...(w ? { width: w } : {})}
        {...(h ? { height: h } : {})}
        loading={loading}
        decoding={priority ? "sync" : "async"}
        {...(priority ? { fetchPriority: "high" as const } : {})}
        className={className}
      />
    </picture>
  );
}

/**
 * `<link rel="preload">` for the LCP image, emitted in a page's <head> via the
 * Next metadata `other` escape hatch or directly in the tree. Preloading the
 * WebP rendition (not the original) is deliberate — it's the one the browser
 * will actually pick.
 */
export function PreloadImage({ src, sizes }: { src: string; sizes?: string }) {
  const meta = optimisedImage(src);
  if (!meta) return null;
  const href = meta.webp ?? meta.src;
  const srcSet = meta.webp
    ? [...(meta.variants ?? []).map((v) => `${v.src} ${v.w}w`), `${meta.webp} ${meta.width}w`].join(", ")
    : undefined;
  return (
    // eslint-disable-next-line @next/next/no-head-element
    <link
      rel="preload"
      as="image"
      href={href}
      {...(srcSet ? { imageSrcSet: srcSet } : {})}
      {...(sizes ? { imageSizes: sizes } : {})}
      type={meta.webp ? "image/webp" : undefined}
    />
  );
}
