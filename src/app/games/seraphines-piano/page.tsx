import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HubFaq } from "@/components/HubFaq";
import { SeraphinesPiano, type PianoCardArt } from "@/components/games/SeraphinesPiano";
import { SONGS, type SongId } from "@/lib/seraphine-piano";

// /games/seraphines-piano (2026-10-16, owner: "a really, really creative game
// called Seraphine's Piano… related to the upcoming Radiance release… very
// graphic, very dynamic… a very, very nice landing page… part of the game
// section"). DECISIONS.md, "Seraphine's Piano". The page is the landing page AND
// the game: an animated hero, the stage, how to play, and Seraphine's Radiance
// cards. One small card read (by slug), cached a day; the game itself is all client.
export const revalidate = 86400;

const TITLE = "Seraphine's Piano: A Riftbound Radiance Rhythm Game";
const DESCRIPTION =
  "Play Seraphine's piano: a free rhythm game for Riftbound: Radiance. Hit the falling notes, charge an Encore, and climb the leaderboard on three songs named for her cards.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: pageAlternates("/games/seraphines-piano"),
  openGraph: pageOpenGraph({
    title: "Seraphine's Piano — play it free on RiftCompare",
    description: DESCRIPTION,
    url: "/games/seraphines-piano",
  }),
};

// Her Radiance printings, in the order the gallery shows them.
const CARD_SLUGS = [
  "seraphine-starry-eyed-songstress-rad-151-167",
  "seraphine-starry-eyed-songstress-rad-174-167",
  "seraphine-not-alone-rad-sp5-005",
  "seraphine-not-alone-rad-138-167",
  "seraphine-not-alone-rad-138a-167",
  "seraphine-inspiring-rad-065-167",
  "seraphine-inspiring-rad-065a-167",
  "encore-rad-152-167",
];
const HERO = ["seraphine-not-alone-rad-sp5-005", "seraphine-starry-eyed-songstress-rad-174-167", "seraphine-inspiring-rad-065a-167"];

type CardRow = {
  slug: string | null;
  name: string;
  imageUrl: string | null;
  imageThumbUrl: string | null;
  rarity: string;
  collectorNumber: string;
};

async function seraphineCards(): Promise<CardRow[]> {
  try {
    const rows = await prisma.card.findMany({
      where: { slug: { in: CARD_SLUGS } },
      select: {
        slug: true,
        name: true,
        imageUrl: true,
        imageThumbUrl: true,
        rarity: true,
        collectorNumber: true,
      },
      take: CARD_SLUGS.length,
    });
    return CARD_SLUGS.map((s) => rows.find((r) => r.slug === s)).filter((r): r is CardRow => !!r);
  } catch {
    return [];
  }
}

const NOTES = [
  {
    left: "6%",
    dur: "11s",
    delay: "0s",
    x: "40px",
    glyph: "♪",
    color: "#ff9fcb",
  },
  {
    left: "18%",
    dur: "9s",
    delay: "-3s",
    x: "-30px",
    glyph: "♫",
    color: "#7fe3ff",
  },
  {
    left: "31%",
    dur: "12s",
    delay: "-6s",
    x: "26px",
    glyph: "✦",
    color: "#ffe39a",
  },
  {
    left: "47%",
    dur: "10s",
    delay: "-1.5s",
    x: "-40px",
    glyph: "♪",
    color: "#c9b1ff",
  },
  {
    left: "62%",
    dur: "13s",
    delay: "-8s",
    x: "30px",
    glyph: "♬",
    color: "#ff9fcb",
  },
  {
    left: "74%",
    dur: "9.5s",
    delay: "-4.5s",
    x: "-20px",
    glyph: "✦",
    color: "#7fe3ff",
  },
  {
    left: "86%",
    dur: "11.5s",
    delay: "-2s",
    x: "34px",
    glyph: "♫",
    color: "#ffe39a",
  },
  {
    left: "94%",
    dur: "10.5s",
    delay: "-7s",
    x: "-36px",
    glyph: "♪",
    color: "#c9b1ff",
  },
];
const KEY_COLORS = ["#ff6fb1", "#5fd8ff", "#b18cff", "#ffd36b", "#ff6fb1", "#5fd8ff", "#b18cff"];

const FAQS = [
  {
    q: "How do I play Seraphine's Piano?",
    a: "Notes fall down four lanes onto Seraphine's piano. Tap a lane (or press D, F, J or K) as its note reaches the glowing line. Every note you hit plays its part of the melody, so the better you play, the more of the song you hear.",
  },
  {
    q: "What is the Encore?",
    a: "Perfect and Great hits fill the Encore meter. When it is full, tap ENCORE or press Space for six seconds of double points and golden notes. It is named for Encore, Seraphine's signature spell in Radiance.",
  },
  {
    q: "How is it scored?",
    a: "A Perfect is worth 300, a Great 200 and a Good 100, multiplied by your combo: ×2 from a 10 combo, ×3 from 25 and ×4 from 50, doubled again during an Encore. Misses drain the Harmony bar, and if it empties the song ends early.",
  },
  {
    q: "Is it free?",
    a: "Yes. No sign-up needed to play. Create a free account to put your best score on the leaderboard.",
  },
  {
    q: "Who is Seraphine in Riftbound?",
    a: "Seraphine debuts in Riftbound: Radiance (release 23 October 2026) with her Legend, Starry-Eyed Songstress, two champion units, Not Alone and Inspiring, and her signature spell Encore. Not Alone also has a K/DA special printing.",
  },
];

export default async function SeraphinesPianoPage() {
  const cards = await seraphineCards();
  const img = (slug: string) => cards.find((c) => c.slug === slug)?.imageUrl ?? null;
  const art = Object.fromEntries(
    SONGS.map((s) => {
      const c = cards.find((x) => x.slug === s.cardSlug);
      return [
        s.id,
        c
          ? ({
              slug: c.slug ?? s.cardSlug,
              name: c.name,
              image: c.imageUrl,
            } satisfies PianoCardArt)
          : null,
      ];
    }),
  ) as Record<SongId, PianoCardArt | null>;
  const hero = HERO.map(img);

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumbs
        trail={[
          { name: "Games", href: "/games" },
          { name: "Seraphine's Piano", href: "/games/seraphines-piano" },
        ]}
      />

      {/* HERO */}
      <section className="relative mt-2 overflow-hidden rounded-[32px] border border-white/10 bg-[#0b0620] px-5 pb-8 pt-10 sm:px-10 sm:pb-12 sm:pt-14">
        <div
          aria-hidden
          className="sp-aurora pointer-events-none absolute -inset-[20%] bg-[radial-gradient(40%_35%_at_25%_30%,rgba(255,111,177,0.35),transparent_70%),radial-gradient(35%_35%_at_75%_25%,rgba(95,216,255,0.28),transparent_70%),radial-gradient(45%_40%_at_60%_80%,rgba(177,140,255,0.3),transparent_70%)]"
        />
        <div aria-hidden className="sp-stars pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {NOTES.map((n, i) => (
            <span
              key={i}
              className="sp-note text-2xl font-black drop-shadow-[0_0_10px_currentColor] sm:text-3xl"
              style={{
                left: n.left,
                color: n.color,
                ["--sp-dur" as string]: n.dur,
                ["--sp-delay" as string]: n.delay,
                ["--sp-x" as string]: n.x,
              }}
            >
              {n.glyph}
            </span>
          ))}
        </div>

        <div className="relative grid items-center gap-8 md:grid-cols-[1.1fr_1fr]">
          <div className="text-center md:text-left">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#ff9fcb]">A Riftbound: Radiance rhythm game</p>
            <h1 className="sp-shine mt-3 font-display text-5xl font-black leading-[0.95] sm:text-6xl">Seraphine&apos;s Piano</h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-slate-200 md:mx-0">
              The stage is set and the lights are low. Hit the falling notes, play her melody back, and save your Encore for the big finish.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <Link
                href="#play"
                className="rounded-full bg-gradient-to-r from-[#ff6fb1] via-[#d98cff] to-[#5fd8ff] px-7 py-3 text-base font-black text-white shadow-[0_0_30px_rgba(255,111,177,0.55)] transition-transform hover:scale-105"
              >
                ▶ Play now
              </Link>
              <Link
                href="#how"
                className="rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-bold text-white backdrop-blur hover:bg-white/10"
              >
                How to play
              </Link>
            </div>
            <p className="mt-4 text-xs text-slate-400">Free · no sign-up · 3 songs · phone or keyboard</p>
          </div>

          {/* Her cards, fanned and floating. */}
          <div className="relative mx-auto h-[300px] w-[300px] sm:h-[360px] sm:w-[380px]">
            {hero.map((src, i) =>
              src ? (
                <div
                  key={i}
                  className="absolute w-[136px] -translate-x-1/2 -translate-y-1/2 sm:w-[176px]"
                  style={{
                    left: `${[24, 50, 76][i]}%`,
                    top: i === 1 ? "46%" : "54%",
                    zIndex: i === 1 ? 3 : 2,
                  }}
                >
                  <div
                    className="sp-float"
                    style={{
                      animationDelay: `${i * -2}s`,
                      ["--sp-rot" as string]: `${[-12, 0, 12][i]}deg`,
                    }}
                  >
                    <Image
                      src={src}
                      alt=""
                      aria-hidden="true"
                      width={372}
                      height={520}
                      priority={i === 1}
                      sizes="180px"
                      className="rounded-[14px] shadow-[0_20px_50px_-10px_rgba(255,111,177,0.55)] ring-1 ring-white/20"
                    />
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>

        {/* A piano that plays itself. */}
        <div aria-hidden className="relative mx-auto mt-8 flex max-w-xl gap-1.5 sm:gap-2">
          {KEY_COLORS.map((c, i) => (
            <span
              key={i}
              className="sp-key h-14 flex-1 rounded-b-xl rounded-t-md border border-white/20 bg-gradient-to-b from-white to-[var(--sp-glow)] sm:h-20"
              style={{
                ["--sp-glow" as string]: c,
                ["--sp-delay" as string]: `${[0, 0.3, 0.6, 0.9, 0.45, 1.2, 1.5][i]}s`,
              }}
            />
          ))}
        </div>
      </section>

      {/* THE STAGE */}
      <section id="play" className="mt-10 scroll-mt-header">
        <SeraphinesPiano art={art} />
        <p className="mt-3 text-center text-xs text-slate-500">Turn your sound on: every note you hit plays the melody.</p>
      </section>

      {/* HOW TO PLAY */}
      <section id="how" className="mt-14 scroll-mt-header">
        <h2 className="text-center font-display text-3xl font-extrabold text-white">How to play</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["🎹", "Hit the notes", "Tap a lane, or press D F J K, as its note crosses the glowing line. Perfect timing scores most."],
            ["🔥", "Build the combo", "Hit notes in a row for ×2, ×3 and ×4. Misses drain Harmony; let it empty and the show is over."],
            ["✦", "Save your Encore", "Perfects charge the Encore. Fire it (Space) for six seconds of golden notes and double points."],
          ].map(([icon, title, body], i) => (
            <div
              key={title}
              className="sp-rise rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent p-5"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#ff6fb1]/30 to-[#b18cff]/30 text-2xl">{icon}</span>
              <h3 className="mt-4 text-lg font-extrabold text-white">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {SONGS.map((s) => (
            <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
              <p className="font-display text-lg font-extrabold text-white">{s.title}</p>
              <p className="text-xs font-bold uppercase tracking-wide text-[#ff9fcb]">
                {s.difficulty} · {s.bpm} BPM
              </p>
              <p className="mt-1 text-slate-400">{s.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* HER CARDS */}
      {cards.length > 0 && (
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-3xl font-extrabold text-white">Seraphine in Radiance</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Each song is named for one of her cards. Radiance releases on 23 October 2026, and every card page compares store prices as listings appear.
              </p>
            </div>
            <Link href="/blog/riftbound-seraphine-radiance-spoiler" className="text-sm font-semibold text-[#ff9fcb] hover:underline">
              How her cards play →
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((c) => (
              <Link
                key={c.slug}
                href={`/card/${c.slug}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-2 transition-all duration-200 hover:-translate-y-1 hover:border-[#ff6fb1]/50 hover:shadow-[0_10px_30px_-10px_rgba(255,111,177,0.5)]"
              >
                {c.imageUrl && (
                  <Image
                    src={c.imageThumbUrl ?? c.imageUrl}
                    alt={`${c.name}, Riftbound Radiance ${c.collectorNumber}`}
                    width={372}
                    height={520}
                    sizes="(min-width: 640px) 220px, 45vw"
                    className="rounded-xl"
                  />
                )}
                <p className="mt-2 truncate text-sm font-bold text-white">{c.name}</p>
                <p className="text-xs text-slate-500">
                  {c.rarity} · RAD {c.collectorNumber}
                </p>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-400">
            More on the set:{" "}
            <Link href="/sets/radiance" className="text-[#ff9fcb] hover:underline">
              every Radiance card
            </Link>
            ,{" "}
            <Link href="/blog/riftbound-kda-cards" className="text-[#ff9fcb] hover:underline">
              the K/DA specials
            </Link>{" "}
            and{" "}
            <Link href="/radiance-preorders" className="text-[#ff9fcb] hover:underline">
              Radiance pre-order prices
            </Link>
            .
          </p>
        </section>
      )}

      <HubFaq faqs={FAQS} heading="Seraphine's Piano: questions" className="mt-14" />

      <p className="mt-8 text-center text-sm text-slate-400">
        <Link href="/games" className="text-brand-400 hover:underline">
          More Riftbound games →
        </Link>
      </p>
    </div>
  );
}
