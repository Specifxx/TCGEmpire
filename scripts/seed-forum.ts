/**
 * Seeds the community forum with a backlog of realistic, already-SOLD "want to
 * sell" listings so the board looks like an established, busy marketplace to
 * newcomers. Every generated post is marked SOLD, so nobody tries to buy a
 * fake listing — they just see a healthy history of completed trades.
 *
 * Safe + idempotent: it only ever touches posts authored by the synthetic
 * persona accounts it creates (recognisable @riftcompare.seed emails). Real
 * user posts are never deleted. Re-run any time to refresh the backlog.
 *
 * Usage:  npx tsx scripts/seed-forum.ts        (uses DATABASE_URL)
 *         npm run db:seed-forum
 *
 * Tunables via env:  FORUM_AU=100 FORUM_NZ=12 FORUM_US=10 npm run db:seed-forum
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AU_STATES, NZ_REGIONS, US_STATES } from "../src/lib/locations";

const prisma = new PrismaClient();

// Marker for the synthetic accounts so re-seeding only clears its own data.
const SEED_DOMAIN = "@riftcompare.seed";

// ---- deterministic PRNG so re-seeding produces the same believable backlog ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x52494654); // "RIFT"
const rand = () => rng();
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (p: number) => rand() < p;
function sample<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

const DAY = 24 * 60 * 60 * 1000;

// ---- seller personas (real User rows so /forum/seller/[id] works) -------------
const SELLER_HANDLES = [
  "RiftRaider", "HextechHoard", "SummonersCove", "NoxianVault", "PiltoverPulls",
  "FreljordFinds", "BanditBinder", "DemaciaDeals", "ShadowIsleSwaps", "IoniaIngots",
  "ZaunZeal", "BilgewaterBoxes", "TargonTrades", "ShurimaShuffle", "RuneterraReserve",
  "TopdeckTrader", "ChromaChaser", "FoilFortune",
];

// Casual buyer handles used as comment authors (no account needed).
const BUYER_HANDLES = [
  "jax_main", "yordle_yeeter", "ezreal_enjoyer", "topdeck_tom", "mana_screwed",
  "foilfiend", "draft_dad", "rift_rookie", "comboqueen", "tilted_titan",
  "singles_sam", "the_pack_cracker", "midlane_meg", "support_diff", "alt_art_andy",
  "binder_betty", "lcq_larry", "sleeve_king", "proxy_pete", "scrub_quotes",
  "gp_grinder", "nexus_nerd", "mulligan_max", "curve_out_carl", "the_chase_chaser",
  "playset_pat", "deckbox_dan", "rng_jesus", "ftk_freddie", "lethal_lisa",
];

const CONTACT_BUILDERS: ((h: string) => string)[] = [
  (h) => `${h.toLowerCase()} on Discord`,
  (h) => `@${h.toLowerCase()}`,
  (h) => `${h.toLowerCase()}#${intBetween(1000, 9999)}`,
  (h) => `${h.toLowerCase()}${intBetween(1, 99)}@gmail.com`,
  (h) => `DM @${h.toLowerCase()} on Discord`,
];

const CONDITIONS = ["NM", "NM", "NM", "NM", "LP", "LP", "MP"]; // weighted toward NM

interface Market {
  code: "AU" | "NZ" | "US";
  country: string;
  regions: { value: string; label: string }[];
  priceField: "lowestPriceCents" | "lowestPriceCentsNz" | "lowestPriceCentsUs";
  currency: string;
}
const MARKETS: Record<string, Market> = {
  AU: { code: "AU", country: "Australia", regions: AU_STATES, priceField: "lowestPriceCents", currency: "AUD" },
  NZ: { code: "NZ", country: "New Zealand", regions: NZ_REGIONS, priceField: "lowestPriceCentsNz", currency: "NZD" },
  US: { code: "US", country: "United States", regions: US_STATES, priceField: "lowestPriceCentsUs", currency: "USD" },
};

interface CardRow {
  name: string;
  setCode: string;
  setName: string;
  rarity: string;
  type: string;
  marketPriceCents: number;
  lowestPriceCents: number | null;
  lowestPriceCentsNz: number | null;
  lowestPriceCentsUs: number | null;
}

function priceFor(card: CardRow, m: Market): number {
  return card[m.priceField] ?? card.lowestPriceCents ?? card.marketPriceCents ?? 0;
}

// Round to a tidy asking price (nearest 50c under $20, nearest $1 above).
function tidy(cents: number): number {
  if (cents <= 0) return 0;
  if (cents < 2000) return Math.max(50, Math.round(cents / 50) * 50);
  return Math.round(cents / 100) * 100;
}

// ---- title / body templates ---------------------------------------------------
function titleFor(cards: CardRow[], setName: string): string {
  const hero = cards[0];
  const single = cards.length === 1;
  const templates = single
    ? [
        `WTS ${hero.name}`,
        `Selling ${hero.name} (${hero.rarity})`,
        `${hero.name} for sale — ${hero.rarity}`,
        `FS: ${hero.name}`,
        `${hero.name} ${chance(0.4) ? "(foil) " : ""}up for grabs`,
      ]
    : [
        `${setName} singles — ${hero.name} + ${cards.length - 1} more`,
        `Selling my ${setName} doubles (${cards.length} cards)`,
        `WTS bundle: ${hero.name}, ${cards[1].name} + others`,
        `Clearing out ${setName} — ${cards.length} cards, combined post`,
        `FS: ${cards.length}x ${setName} singles, will split`,
        `${hero.name} + extras — grab the lot and save on postage`,
      ];
  return pick(templates);
}

function bodyFor(cards: CardRow[], region: string, country: string): string {
  const openers = [
    `All ${chance(0.5) ? "NM" : "near mint"}, stored in sleeves + toploaders.`,
    `Pulled from my own packs, kept in penny sleeves since opening.`,
    `Decluttering the collection, everything's in great shape.`,
    `Moving house so these need to go.`,
    `Cleaning out my binder — prices are fair, happy to chat.`,
    `Pack-fresh condition, can send extra pics on request.`,
  ];
  const postage = [
    `Combined postage for multiples.`,
    `Tracked post Australia-wide, or pickup welcome.`,
    `Will do combined shipping if you grab a few.`,
    `Postage at cost, or local pickup in ${region || country}.`,
    `Happy to combine with other listings to save you postage.`,
    `Bubble mailer + rigid card protector standard.`,
  ];
  const payment = [
    `PayPal G&S or bank transfer.`,
    `PayID / bank transfer preferred, PayPal fine too.`,
    `Open to reasonable offers, Discord is fastest.`,
    `Prices firm-ish but bundle discounts available.`,
    `First in first served, no holds sorry.`,
  ];
  const sold = [
    `\n\nEDIT: Sold, thanks everyone! 🙌`,
    `\n\nUPDATE: All gone — cheers for the interest.`,
    `\n\n*** SOLD *** thanks to the buyer, super easy trade.`,
    `\n\nSold pending payment.`,
    `\n\nThat's everything sold, will list more soon.`,
  ];
  const parts = [pick(openers), pick(postage), pick(payment)];
  let body = parts.join(" ");
  if (chance(0.85)) body += pick(sold);
  return body;
}

// ---- comment templates --------------------------------------------------------
function commentBody(cards: CardRow[], sold: boolean): string {
  const inquiries = [
    `Still available?`,
    `Interested! Sent you a DM.`,
    `What's the lowest you'd take for the lot?`,
    `Could you do combined postage if I grab a couple?`,
    `Is the ${pick(cards).name} still up?`,
    `Any chance of pics?`,
    `PM'd you 🙂`,
    `Would you split? Just after the ${pick(cards).name}.`,
    `How much posted to ${pick(["NSW", "VIC", "QLD", "WA", "SA"])}?`,
    `GLWS mate 👍`,
  ];
  const closing = [
    `Sold to me — arrived super fast, thanks heaps!`,
    `Cheers, payment sent! 🙏`,
    `Bought from this seller before, can recommend. Quick post.`,
    `Got mine today, mint as described. A+`,
    `Damn, missed it. GL with the rest!`,
    `Thanks again, smooth trade.`,
  ];
  return sold && chance(0.5) ? pick(closing) : pick(inquiries);
}

async function ensurePersonas(passwordHash: string) {
  const memberSinceBase = Date.now() - 420 * DAY;
  const personas: { id: string; displayName: string; contact: string }[] = [];
  for (let i = 0; i < SELLER_HANDLES.length; i++) {
    const handle = SELLER_HANDLES[i];
    const email = `${handle.toLowerCase()}${SEED_DOMAIN}`;
    const createdAt = new Date(memberSinceBase + i * 9 * DAY + intBetween(0, 6) * DAY);
    const user = await prisma.user.upsert({
      where: { email },
      update: { displayName: handle, emailVerified: createdAt },
      create: {
        email,
        passwordHash,
        displayName: handle,
        emailVerified: createdAt,
        balanceCents: intBetween(0, 5000),
        isAdmin: false,
        createdAt,
      },
    });
    personas.push({ id: user.id, displayName: handle, contact: pick(CONTACT_BUILDERS)(handle) });
  }
  return personas;
}

async function main() {
  const AU = Number(process.env.FORUM_AU ?? 100);
  const NZ = Number(process.env.FORUM_NZ ?? 12);
  const US = Number(process.env.FORUM_US ?? 10);

  // One-shot mode (used by the production build hook): if the forum has already
  // been seeded, skip entirely so deploys don't churn the backlog. Manual runs
  // (`npm run db:seed-forum`) omit the flag and always refresh.
  if (process.env.FORUM_SEED_ONLY_IF_EMPTY) {
    const personaUsers = await prisma.user.findMany({
      where: { email: { endsWith: SEED_DOMAIN } },
      select: { id: true },
    });
    const ids = personaUsers.map((u) => u.id);
    const existing = ids.length ? await prisma.forumPost.count({ where: { userId: { in: ids } } }) : 0;
    if (existing > 0) {
      console.log(`Forum already seeded (${existing} synthetic posts) — skipping (FORUM_SEED_ONLY_IF_EMPTY).`);
      return;
    }
  }

  const cards = (await prisma.card.findMany({
    where: { isPromo: false },
    select: {
      name: true, setCode: true, setName: true, rarity: true, type: true,
      marketPriceCents: true, lowestPriceCents: true, lowestPriceCentsNz: true, lowestPriceCentsUs: true,
    },
  })) as CardRow[];

  if (cards.length === 0) {
    console.error("No cards in the database — run `npm run db:seed` first.");
    process.exit(1);
  }
  console.log(`Loaded ${cards.length} cards to build listings from.`);

  const passwordHash = await bcrypt.hash("password123", 10);
  const personas = await ensurePersonas(passwordHash);
  console.log(`Ensured ${personas.length} seller personas.`);

  // Idempotent reset: drop only our synthetic posts (cascades their comments).
  const personaIds = personas.map((p) => p.id);
  const removed = await prisma.forumPost.deleteMany({ where: { userId: { in: personaIds } } });
  console.log(`Cleared ${removed.count} previous synthetic posts.`);

  const plan: { market: Market; count: number }[] = [
    { market: MARKETS.AU, count: AU },
    { market: MARKETS.NZ, count: NZ },
    { market: MARKETS.US, count: US },
  ];
  const total = plan.reduce((s, p) => s + p.count, 0);

  // Spread createdAt across the last ~6 months, most recent first.
  const now = Date.now();
  const SPAN = 185 * DAY;
  const allComments: Prisma.ForumCommentCreateManyInput[] = [];
  let created = 0;
  let n = 0;

  for (const { market, count } of plan) {
    for (let i = 0; i < count; i++, n++) {
      const seller = pick(personas);
      // 1–6 cards, biased toward small lots; quantities mostly 1.
      const lotSize = chance(0.55) ? 1 : intBetween(2, 6);
      const chosen = sample(cards, lotSize);
      if (chosen.length === 0) continue;

      const items = chosen.map((c) => {
        const qty = c.rarity === "Common" || c.rarity === "Uncommon" ? intBetween(1, 4) : intBetween(1, 2);
        return {
          name: c.name,
          setCode: c.setCode,
          condition: pick(CONDITIONS),
          qty,
          marketCents: priceFor(c, market),
        };
      });
      const marketCents = items.reduce((s, it) => s + (it.marketCents || 0) * it.qty, 0) || null;
      // Asking price: small discount on market, tidied. ~20% leave it as "make offer".
      const priceCents = marketCents != null && chance(0.8)
        ? tidy(Math.round(marketCents * between(0.82, 0.98)))
        : null;

      const region = pick(market.regions);
      const setName = chosen[0].setName;
      // Dates: newest posts first across the whole run.
      const ageMs = (n / Math.max(1, total - 1)) * SPAN + between(0, 1.5 * DAY);
      const createdAt = new Date(now - Math.min(SPAN, ageMs) - 2 * DAY);

      const post = await prisma.forumPost.create({
        data: {
          kind: "WTS",
          title: titleFor(chosen, setName),
          items: items as unknown as Prisma.InputJsonValue,
          marketCents,
          priceCents,
          body: bodyFor(chosen, region.value, market.country),
          contact: chance(0.75) ? seller.contact : "",
          country: market.country,
          state: region.value,
          market: market.code,
          authorName: seller.displayName,
          userId: seller.id,
          score: intBetween(0, 14),
          status: "SOLD",
          createdAt,
        },
        select: { id: true },
      });
      created++;

      // Randomised comments: ~65% of posts get 1–5, dated after the post.
      if (chance(0.65)) {
        const cCount = intBetween(1, 5);
        for (let c = 0; c < cCount; c++) {
          const isLast = c === cCount - 1;
          const cCreated = new Date(createdAt.getTime() + (c + 1) * intBetween(2, 40) * 60 * 60 * 1000);
          allComments.push({
            postId: post.id,
            userId: null,
            authorName: pick(BUYER_HANDLES),
            body: commentBody(chosen, isLast),
            createdAt: cCreated > new Date(now) ? new Date(now) : cCreated,
          });
        }
      }
    }
  }

  if (allComments.length) {
    await prisma.forumComment.createMany({ data: allComments });
  }

  console.log(`Created ${created} SOLD listings (${AU} AU / ${NZ} NZ / ${US} US) and ${allComments.length} comments.`);
  console.log("Done ✔  Open /forum to see the populated board (paginated 10 per page).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
