import { ImageResponse } from "next/og";
import { getSharedCollection } from "@/lib/share";
import { formatMoney } from "@/lib/format";
import { DEFAULT_COUNTRY } from "@/lib/country";

// Unfurl for a shared binder. Shows the top three cards' art rather than one:
// a collection is a set of things, and three fanned thumbnails read as "look at
// all this" in a way a single card never does.
//
// Valued in DEFAULT_COUNTRY, not the viewer's market — deliberately. This image
// is fetched once by Discord/Slack/X's own crawler and then cached and served to
// everyone who sees the message, so there is no "viewer" to localise for at the
// time it is generated. The page itself does localise (see its getCountry call);
// the caption below names the currency so the two are never read as disagreeing.
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A shared Riftbound collection on RiftCompare";

const accent = "#34d17e";

export default async function Image({ params }: { params: { token: string } }) {
  const shared = await getSharedCollection(params.token, DEFAULT_COUNTRY).catch(() => null);

  const owner = shared?.ownerName ?? "A collector";
  const arts = (shared?.holdings ?? [])
    .map((h) => h.card.imageUrl ?? h.card.imageThumbUrl)
    .filter((a): a is string => Boolean(a))
    .slice(0, 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0b0f17 0%, #101826 55%, #0c2018 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 40 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 56,
                height: 56,
                borderRadius: 14,
                background: accent,
                color: "#06130c",
                fontSize: 34,
                fontWeight: 800,
                marginRight: 18,
              }}
            >
              R
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 28, fontWeight: 700 }}>RiftCompare</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ color: "#94a3b8", fontSize: 26, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2 }}>
              Shared collection
            </div>
            <div style={{ color: "#ffffff", fontSize: owner.length > 16 ? 56 : 68, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>
              {`${owner}'s binder`}
            </div>
            {shared ? (
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 18 }}>
                <div style={{ color: accent, fontSize: 72, fontWeight: 800, lineHeight: 1 }}>
                  {formatMoney(shared.totalCents, shared.currency)}
                </div>
                <div style={{ color: "#94a3b8", fontSize: 26, fontWeight: 600, marginLeft: 16 }}>
                  {`${shared.distinctCards} card${shared.distinctCards === 1 ? "" : "s"}`}
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ color: "#cbd5e1", fontSize: 22, fontWeight: 500 }}>
            {`Valued daily against live store prices${shared ? ` · ${shared.currency}` : ""}`}
          </div>
        </div>

        {/* Overlapping fan. Rendered right-to-left with negative margins so the
            leftmost card sits on top, which is how a hand of cards reads. */}
        {arts.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: 400 }}>
            {arts.map((a, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a}
                src={a}
                width={250}
                height={350}
                alt=""
                style={{
                  borderRadius: 16,
                  objectFit: "cover",
                  marginLeft: i === 0 ? 0 : -140,
                  transform: `rotate(${(i - 1) * 6}deg)`,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    ),
    size
  );
}
