import Link from "next/link";
import type { SetProseBlock } from "@/lib/pokemon/set-facts";

// A set page's data-led paragraphs (lib/pokemon/set-facts.ts), with the sets
// and products they name linked in place.
export function SetFacts({ blocks, className = "" }: { blocks: SetProseBlock[]; className?: string }) {
  if (!blocks.length) return null;
  return (
    <div className={`max-w-3xl space-y-2 text-sm leading-relaxed text-slate-300 ${className}`}>
      {blocks.map((b) => (
        <p key={b.id} data-block={b.id}>
          {b.parts.map((part, i) =>
            typeof part === "string" ? (
              part
            ) : (
              <Link key={i} href={part.href} className="text-brand-400 hover:underline">
                {part.text}
              </Link>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
