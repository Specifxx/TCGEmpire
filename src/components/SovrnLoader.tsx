"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { SOVRN_KEY } from "@/lib/affiliate";

// Sovrn Commerce (VigLink) install snippet, injected into the server-rendered
// HTML stream via useServerInsertedHTML (the CSS-in-JS insertion mechanism).
//
// Why this exact mechanism: Sovrn's install verifier greps the raw page HTML
// and rejects BOTH "code not found" and "multiple instances".
//  - A deferred client-side loader never appears in the HTML → "not found".
//  - A normal server-rendered <script> appears TWICE → once as the real tag
//    and once serialized inside Next's RSC flight payload → "multiple
//    instances".
// Stream insertion puts the snippet in the document exactly once: it is not
// part of the hydrated React tree, so no flight copy exists. The ref guards
// against the callback running once per streaming flush.
//
// vglnk.js loads async (no render blocking) and honours rel="norewrite", so
// it can never re-wrap our full-rate direct affiliate links.
export function SovrnLoader() {
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return (
      <script
        type="text/javascript"
        dangerouslySetInnerHTML={{
          __html: `var vglnk = {key: '${SOVRN_KEY}'};
(function(d, t) {var s = d.createElement(t);
  s.type = 'text/javascript';s.async = true;
  s.src = '//cdn.viglink.com/api/vglnk.js';
  var r = d.getElementsByTagName(t)[0];
  r.parentNode.insertBefore(s, r);
}(document, 'script'));`,
        }}
      />
    );
  });
  return null;
}
