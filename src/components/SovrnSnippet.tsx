import { Suspense } from "react";
import { SovrnLoader } from "./SovrnLoader";

// Sovrn requires its snippet "directly before </body>". The stream-inserted
// <script> (see SovrnLoader) is emitted at the NEXT flush after the component
// renders — for shell-rendered components that flush is the initial one, which
// lands in <head>. Suspending past the shell flush makes the insertion ride a
// late body chunk instead, so the snippet ends up near </body> while staying
// raw server HTML with exactly one copy in the document.
async function AfterShell() {
  await new Promise((r) => setTimeout(r, 150));
  return <SovrnLoader />;
}

export function SovrnSnippet() {
  return (
    <Suspense fallback={null}>
      <AfterShell />
    </Suspense>
  );
}
