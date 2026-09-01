import { SITE_URL } from "@/lib/site";
import { nextDatedRelease, assumedStreetInstant, releaseDateLabel } from "@/lib/release-calendar";

// Embeddable release countdown. A chrome-free HTML document (no app layout, no
// React hydration) that a fan site, a store, or a Discord-linked blog can drop
// into an <iframe> — same pattern as embed/card/[id]/route.ts's price badge,
// just ticking instead of static. Built as a route handler so it escapes the
// root layout entirely and can be framed cross-origin (see next.config.js's
// existing /embed/* frame-ancestors allowance — this route rides that same
// rule, not a new one).
//
// SET-AGNOSTIC ON PURPOSE, same discipline as /release-dates itself: nothing
// here names a set in code. It always shows whichever release nextDatedRelease()
// returns, so it keeps working the day Radiance ships and Legacy becomes next —
// no edit, no stale embed left pointing at a set that already released.
export const revalidate = 3600;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const next = nextDatedRelease();
  const instant = next ? assumedStreetInstant(next.date) : null;
  const body = next && instant ? renderCountdown(next.name, instant, releaseDateLabel(next.date)) : renderNoneScheduled();

  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      // The shell already carries <meta name="robots" content="noindex">; the
      // header covers the case where the widget is fetched as a subresource and
      // the meta tag is never parsed.
      "X-Robots-Tag": "noindex",
    },
  });
}

function renderCountdown(name: string, targetIso: string, dateLabel: string | null): string {
  const href = `${SITE_URL}/release-dates?utm_source=embed&utm_medium=widget&utm_campaign=release-countdown`;
  return shell(`
  <a class="rc-wrap" href="${esc(href)}" target="_blank" rel="noopener">
    <div class="rc-head">
      <span class="rc-chip">Riftbound</span>
      <span class="rc-name">${esc(name)}</span>
    </div>
    <div class="rc-grid" id="rc-grid" data-target="${esc(targetIso)}">
      <div class="rc-cell"><span class="rc-num" id="rc-d">--</span><span class="rc-lbl">days</span></div>
      <div class="rc-cell"><span class="rc-num" id="rc-h">--</span><span class="rc-lbl">hrs</span></div>
      <div class="rc-cell"><span class="rc-num" id="rc-m">--</span><span class="rc-lbl">min</span></div>
      <div class="rc-cell"><span class="rc-num" id="rc-s">--</span><span class="rc-lbl">sec</span></div>
    </div>
    ${dateLabel ? `<div class="rc-date">${esc(dateLabel)}</div>` : ""}
  </a>
  <div class="rc-foot"><span>Live prices by <strong>RiftCompare</strong></span></div>
  <script>
    (function () {
      var target = new Date(document.getElementById("rc-grid").getAttribute("data-target")).getTime();
      var d = document.getElementById("rc-d"), h = document.getElementById("rc-h"),
          m = document.getElementById("rc-m"), s = document.getElementById("rc-s");
      function pad(n) { return String(n).padStart(2, "0"); }
      function tick() {
        var diff = Math.max(0, target - Date.now());
        var totalSeconds = Math.floor(diff / 1000);
        d.textContent = pad(Math.floor(totalSeconds / 86400));
        h.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
        m.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
        s.textContent = pad(totalSeconds % 60);
        if (diff <= 0) clearInterval(timer);
      }
      tick();
      var timer = setInterval(tick, 1000);
    })();
  </script>`);
}

function renderNoneScheduled(): string {
  return shell(`
  <a class="rc-wrap" href="${SITE_URL}/release-dates?utm_source=embed&utm_medium=widget" target="_blank" rel="noopener">
    <div class="rc-head"><span class="rc-chip">Riftbound</span><span class="rc-name">Release calendar</span></div>
    <div class="rc-date">Nothing dated yet — check the full schedule</div>
  </a>
  <div class="rc-foot"><span>Live prices by <strong>RiftCompare</strong></span></div>`);
}

// Self-contained dark widget. Inline CSS + inline script only (it loads in a
// sandboxed iframe, so nothing here can reach an external stylesheet or a
// bundled script chunk).
function shell(inner: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Riftbound release countdown</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:transparent;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  a{text-decoration:none;color:inherit}
  .rc-wrap{display:block;padding:14px 16px;border:1px solid #252b38;border-radius:14px;
    background:linear-gradient(135deg,#0e1116,#13171f);color:#e2e8f0;transition:border-color .15s,transform .15s}
  .rc-wrap:hover{border-color:#22c55e;transform:translateY(-1px)}
  .rc-head{display:flex;align-items:center;gap:8px;margin-bottom:10px}
  .rc-chip{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#34d399;
    border:1px solid rgba(52,211,153,.35);background:rgba(34,197,94,.1);border-radius:6px;padding:2px 6px}
  .rc-name{font-weight:800;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .rc-cell{display:flex;flex-direction:column;align-items:center;justify-content:center;
    border:1px solid rgba(52,211,153,.2);border-radius:10px;background:#0a0d12;padding:8px 4px}
  .rc-num{font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:800;font-size:22px;color:#5eead4;
    font-variant-numeric:tabular-nums}
  .rc-lbl{margin-top:3px;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b}
  .rc-date{margin-top:9px;font-size:11px;color:#94a3b8;text-align:center}
  .rc-foot{margin-top:6px;text-align:right;font-size:10px;color:#64748b}
  .rc-foot strong{color:#94a3b8}
</style></head><body>${inner}</body></html>`;
}
