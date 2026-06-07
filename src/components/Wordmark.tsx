/* eslint-disable @next/next/no-img-element */
// Brand wordmark: the logo's ornate R (white) starts "Rift" and the logo's ornate C
// (green) starts "Compare". Glyph heights are em-relative so the wordmark scales with
// the surrounding font-size.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center font-extrabold leading-none tracking-tight ${className}`}
      aria-label="RiftCompare"
    >
      <img src="/logo-r.png" alt="R" className="h-[1.55em] w-auto select-none" draggable={false} />
      <span className="-ml-[0.12em] text-white" aria-hidden>ift</span>
      <img src="/logo-c.png" alt="C" className="ml-[0.05em] h-[1.4em] w-auto select-none" draggable={false} />
      <span className="-ml-[0.06em] text-brand-400" aria-hidden>ompare</span>
    </span>
  );
}
