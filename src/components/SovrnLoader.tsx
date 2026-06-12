import { SOVRN_KEY } from "@/lib/affiliate";

// Sovrn Commerce (VigLink) install snippet, rendered INLINE in the server HTML.
//
// This must be a server-rendered <script> (not a deferred/lazy injection):
// Sovrn's install verifier fetches the raw page HTML and greps for the snippet,
// so a client-side loader — even one that runs seconds later — reads as "code
// not found on website". The snippet below is their standard install verbatim;
// the heavy part (vglnk.js itself) still loads `async`, so first paint is not
// blocked.
//
// What it does: rewrites outbound merchant links to monetised redirects at
// click time. Links we already monetise directly (eBay EPN, TCGplayer Impact,
// Amazon, our server-side Sovrn redirects) carry rel="norewrite", which
// vglnk.js honours — the script can never hijack a full-rate direct link.
export function SovrnLoader() {
  if (!SOVRN_KEY) return null;
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
}
