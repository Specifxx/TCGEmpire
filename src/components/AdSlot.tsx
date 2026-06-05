// Placeholder ad slot. Drop in a real ad network (e.g. Google AdSense, Ezoic,
// or direct sponsor) by replacing the inner markup once approved.
export function AdSlot({
  label = "Advertisement",
  height = 90,
  className,
}: {
  label?: string;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid place-items-center rounded-xl border border-dashed border-ink-700 bg-ink-900/60 text-center ${className ?? ""}`}
      style={{ minHeight: height }}
      aria-label="advertisement"
    >
      <div className="text-xs uppercase tracking-widest text-slate-600">
        {label}
        <div className="mt-1 text-[10px] normal-case tracking-normal text-slate-700">
          Ad space — your sponsor here
        </div>
      </div>
    </div>
  );
}
