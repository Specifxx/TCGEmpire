import { prisma } from "@/lib/db";
import { normalizeCountry, pickPrice, currencyOf, COUNTRIES, type Country } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { cardImageAlt } from "@/lib/image-alt";

// Embeddable price widget. A chrome-free HTML document (no app layout, no React
// hydration) that creators, store sites and Discord-linked blogs can drop into an
// <iframe>. Every widget is a live "from $X across N stores" badge that links back
// to the full RiftCompare comparison — a free, compounding backlink + brand engine.
//
// Built as a route handler (not a page) so it escapes the root layout entirely and
// so /embed can be framed cross-origin (see next.config.js frame-ancestors).
export const revalidate = 300;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const market: Country = normalizeCountry(url.searchParams.get("market"));

  const card = await prisma.card
    .findFirst({
      where: { OR: [{ slug: params.id }, { id: params.id }] },
      select: {
        id: true, slug: true, name: true, setCode: true, setName: true, collectorNumber: true,
        rarity: true, imageThumbUrl: true,
        lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsEu: true,
        retailerPrices: {
          where: { country: market, inStock: true },
          select: { id: true },
        },
      },
    })
    .catch(() => null);

  // An unknown card id must answer 404, not 200. The widget previously returned
  // "200 OK" with a "Card not found" card inside it — the textbook soft-404
  // shape, on a route where anyone embedding the widget can invent the id. An
  // iframe renders the body of a 404 response exactly the same as a 200, so the
  // friendly fallback is kept; only the status line changes. Misses also get a
  // much shorter cache so a card that gets imported later goes live promptly.
  const body = card ? renderCard(card, market) : renderMissing();
  return new Response(body, {
    status: card ? 200 : 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": card
        ? "public, s-maxage=300, stale-while-revalidate=900"
        : "public, s-maxage=60",
      // The shell already carries <meta name="robots" content="noindex">; the
      // header covers the case where the widget is fetched as a subresource and
      // the meta tag is never parsed.
      "X-Robots-Tag": "noindex",
    },
  });
}

type EmbedCard = {
  id: string; slug: string | null; name: string; setCode: string; setName: string; collectorNumber: string;
  rarity: string; imageThumbUrl: string | null;
  lowestPriceCents: number | null; lowestPriceCentsUs: number | null; lowestPriceCentsUk: number | null;
  lowestPriceCentsSg?: number | null; lowestPriceCentsCa?: number | null; lowestPriceCentsEu?: number | null;
  retailerPrices: { id: string }[];
};

function renderCard(card: EmbedCard, market: Country): string {
  const price = pickPrice(card, market);
  const currency = currencyOf(market);
  const flag = COUNTRIES[market].flag;
  const href = `${SITE_URL}/card/${card.slug ?? card.id}?utm_source=embed&utm_medium=widget&utm_campaign=price-badge`;
  const storeCount = card.retailerPrices.length;
  const priceLabel = price != null ? `${formatMoney(price, currency)}` : "—";
  const sub = price != null
    ? `from ${storeCount} ${storeCount === 1 ? "store" : "stores"} ${flag}`
    : "no live listings yet";
  const img = card.imageThumbUrl ? esc(card.imageThumbUrl) : "";

  return shell(`
  <a class="rc-card" href="${esc(href)}" target="_blank" rel="noopener">
    ${img ? `<img class="rc-img" src="${img}" alt="${esc(cardImageAlt(card))}" width="56" height="78" loading="lazy" decoding="async" />` : `<div class="rc-img rc-noimg">🃏</div>`}
    <div class="rc-body">
      <div class="rc-name" title="${esc(card.name)}">${esc(card.name)}</div>
      <div class="rc-meta">${esc(card.setCode)} · ${esc(card.collectorNumber)} · ${esc(card.rarity)}</div>
      <div class="rc-price-row">
        <span class="rc-from">from</span>
        <span class="rc-price">${esc(priceLabel)}</span>
      </div>
      <div class="rc-sub">${esc(sub)}</div>
    </div>
    <div class="rc-cta">Compare&nbsp;→</div>
  </a>
  <div class="rc-foot">
    <span>Live prices by <strong>RiftCompare</strong></span>
  </div>`);
}

function renderMissing(): string {
  return shell(`
  <a class="rc-card" href="${SITE_URL}?utm_source=embed&utm_medium=widget" target="_blank" rel="noopener">
    <div class="rc-img rc-noimg">🔍</div>
    <div class="rc-body">
      <div class="rc-name">Card not found</div>
      <div class="rc-meta">Search every Riftbound card on RiftCompare</div>
      <div class="rc-sub">riftcompare.com</div>
    </div>
    <div class="rc-cta">Open&nbsp;→</div>
  </a>`);
}

// Self-contained dark widget. Inline CSS only (it loads in a sandboxed iframe).
function shell(inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>RiftCompare price</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:transparent;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  a{text-decoration:none;color:inherit}
  .rc-card{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #252b38;border-radius:14px;
    background:linear-gradient(135deg,#0e1116,#13171f);color:#e2e8f0;transition:border-color .15s,transform .15s}
  .rc-card:hover{border-color:#22c55e;transform:translateY(-1px)}
  .rc-img{width:48px;height:67px;border-radius:8px;object-fit:cover;flex:none;background:#191e28}
  .rc-noimg{display:flex;align-items:center;justify-content:center;font-size:24px}
  .rc-body{min-width:0;flex:1}
  .rc-name{font-weight:800;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rc-meta{font-size:11px;color:#94a3b8;margin-top:1px}
  .rc-price-row{display:flex;align-items:baseline;gap:5px;margin-top:5px}
  .rc-from{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.04em}
  .rc-price{font-size:19px;font-weight:800;color:#f5a524}
  .rc-sub{font-size:11px;color:#64748b;margin-top:1px}
  .rc-cta{flex:none;align-self:center;background:rgba(34,197,94,.12);color:#34d399;font-weight:700;
    font-size:12px;padding:7px 11px;border-radius:9px;border:1px solid rgba(34,197,94,.35)}
  .rc-foot{margin-top:6px;text-align:right;font-size:10px;color:#64748b}
  .rc-foot strong{color:#94a3b8}
</style></head><body>${inner}</body></html>`;
}
