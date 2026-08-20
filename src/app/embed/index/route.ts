import { getMarketIndex, type MarketScope } from "@/lib/market-index";
import { SITE_URL } from "@/lib/site";

// Embeddable RiftCompare Index widget — a chrome-free HTML doc (no app layout) that
// creators, TCG blogs and newsletters can drop into an <iframe>. A live "Index 112
// ▲ +2.3% (7d)" badge with a sparkline that links back to /market — a compounding
// backlink + brand-mention engine (and brand mentions are the top AI-citation signal).
// Route handler so it escapes the root layout and can be framed cross-origin.
export const revalidate = 1800;

function parseMarket(v: string | null): MarketScope {
  const up = (v ?? "").toUpperCase();
  return up === "AU" || up === "US" || up === "UK" ? (up as MarketScope) : "GLOBAL";
}

// Build a tiny SVG sparkline (no JS) from the index series.
function sparkline(points: { v: number }[], w = 260, h = 46): string {
  const vals = points.map((p) => p.v);
  if (vals.length < 2) return "";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const step = w / (vals.length - 1);
  const coords = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`);
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "#34d17e" : "#f87171";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${coords.join(" ")}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  </svg>`;
}

export async function GET(req: Request) {
  const market = parseMarket(new URL(req.url).searchParams.get("market"));
  const index = await getMarketIndex(market).catch(() => null);
  const href = `${SITE_URL}/market?utm_source=embed&utm_medium=widget&utm_campaign=index-badge`;

  let inner: string;
  if (!index) {
    inner = `<a class="rc-w" href="${href}" target="_blank" rel="noopener">
      <div class="rc-h">The RiftCompare Index</div>
      <div class="rc-sub">warming up — see riftcompare.com/market</div></a>`;
  } else {
    const d7 = index.d7;
    const up = d7 != null && d7 > 0;
    const flat = d7 == null || d7 === 0;
    const col = flat ? "#94a3b8" : up ? "#34d17e" : "#f87171";
    const delta = d7 == null ? "" : `${up ? "▲ +" : d7 < 0 ? "▼ " : "■ "}${Math.abs(d7)}% (7d)`;
    inner = `<a class="rc-w" href="${href}" target="_blank" rel="noopener">
      <div class="rc-top">
        <div class="rc-h">The RiftCompare Index</div>
        <div class="rc-badge">LIVE</div>
      </div>
      <div class="rc-row">
        <span class="rc-level">${index.latest.toFixed(1)}</span>
        <span class="rc-delta" style="color:${col}">${delta}</span>
      </div>
      ${sparkline(index.points.slice(-90))}
      <div class="rc-sub">The Riftbound market in one number · <strong>RiftCompare</strong> →</div>
    </a>`;
  }

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>The RiftCompare Index</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:transparent;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  a{text-decoration:none;color:inherit;display:block}
  .rc-w{padding:14px 16px;border:1px solid #252b38;border-radius:16px;
    background:linear-gradient(135deg,#0e1116,#13171f);color:#e2e8f0;transition:border-color .15s,transform .15s}
  .rc-w:hover{border-color:#22c55e;transform:translateY(-1px)}
  .rc-top{display:flex;align-items:center;justify-content:space-between}
  .rc-h{font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}
  .rc-badge{font-size:9px;font-weight:800;color:#34d399;background:rgba(34,197,94,.12);
    border:1px solid rgba(34,197,94,.35);border-radius:6px;padding:2px 6px}
  .rc-row{display:flex;align-items:baseline;gap:12px;margin-top:6px}
  .rc-level{font-size:40px;font-weight:800;color:#fff;line-height:1}
  .rc-delta{font-size:16px;font-weight:800}
  .rc-w svg{display:block;width:100%;height:46px;margin-top:8px}
  .rc-sub{font-size:11px;color:#64748b;margin-top:6px}
  .rc-sub strong{color:#94a3b8}
</style></head><body>${inner}</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
