// "Prices tracked on RiftCompare" — a badge a store can put on its own site,
// linking to its /stores/[slug] page (2026-09-24 growth pass).
//
// PLAIN HTML + INLINE SVG, NOT AN IFRAME, and that is the whole point: a link
// inside an iframe is a link on OUR document, so it earns the store nothing and
// us no backlink. This is ordinary markup on the store's own page. No script,
// no external image, no tracking — the SVG is inline so nothing is fetched.
// The same function renders the preview on the store page and the copyable
// snippet, so what a store sees is exactly what it pastes.
import { SITE_URL } from "./site";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The R mark as a 16px inline SVG (brand green circle, white R). */
const MARK =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none"><circle cx="8" cy="8" r="8" fill="#34d17e"/><path d="M5.5 12V4h3a2.4 2.4 0 0 1 .6 4.7L11 12H9.3L7.6 8.9H7V12z M7 7.6h1.4a1.1 1.1 0 0 0 0-2.2H7z" fill="#06210f"/></svg>';

export function storeBadgeHtml(store: { slug: string; name: string }): string {
  const href = `${SITE_URL}/stores/${encodeURIComponent(store.slug)}`;
  const title = `${store.name} Riftbound prices on RiftCompare`;
  return (
    `<a href="${href}" title="${esc(title)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;` +
    `border:1px solid #233047;border-radius:8px;background:#0b0f17;color:#e2e8f0;font:600 12px/1.2 system-ui,sans-serif;text-decoration:none">` +
    `${MARK}<span>Prices tracked on RiftCompare</span></a>`
  );
}

/** The plain-HTML attribution line that goes UNDER an iframe widget snippet. */
export function embedAttributionHtml(href: string, label: string): string {
  return `<p style="margin:4px 0 0;font:12px system-ui,sans-serif"><a href="${href}">${esc(label)}</a></p>`;
}
