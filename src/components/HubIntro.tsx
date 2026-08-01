import { hubIntro } from "@/lib/content/hub-intros";

// Renders the editorial intro for a hub or tool page. Nothing if the route has
// no entry, so adding one is a single edit in lib/content/hub-intros.ts.
//
// Placed directly under the page's <h1> on purpose: this is the text that
// answers "what is this and is it what I wanted?" for a visitor arriving from
// search, and it is the text that stops an interactive tool from reading as an
// empty page to anything that judges pages by their content.
export function HubIntro({ path, className }: { path: string; className?: string }) {
  const paragraphs = hubIntro(path);
  if (!paragraphs.length) return null;
  return (
    <div className={className ?? "mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400"}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
