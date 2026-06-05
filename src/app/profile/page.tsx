import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatAUD, timeAgo } from "@/lib/format";
import { ConditionBadge, FoilBadge } from "@/components/Badge";
import {
  CancelListingButton,
  LogoutButton,
  TopUpButton,
} from "@/components/ProfileActions";
import { CancelBuyOrderButton } from "@/components/BuyOrderActions";

export const dynamic = "force-dynamic";

const orderInclude = {
  listing: { include: { card: { select: { id: true, name: true } } } },
  buyOrder: { include: { card: { select: { id: true, name: true } } } },
  seller: { select: { displayName: true } },
  buyer: { select: { displayName: true } },
};

function orderCard(o: any) {
  return o.listing?.card ?? o.buyOrder?.card ?? { id: "", name: "Unknown card" };
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [listings, buyOrders, purchases, sales] = await Promise.all([
    prisma.listing.findMany({
      where: { sellerId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { card: { select: { id: true, name: true, collectorNumber: true } } },
    }),
    prisma.buyOrder.findMany({
      where: { buyerId: user.id, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      include: { card: { select: { id: true, name: true, collectorNumber: true } } },
    }),
    prisma.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: orderInclude,
    }),
    prisma.order.findMany({
      where: { sellerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: orderInclude,
    }),
  ]);

  const reserved = buyOrders.reduce((n, b) => n + b.reservedCents, 0);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-2xl font-black text-white">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white">{user.displayName}</h1>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <LogoutButton />
      </div>

      {/* Wallet */}
      <div className="card-surface mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex gap-8">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Available balance</p>
            <p className="text-3xl font-extrabold text-accent">{formatAUD(user.balanceCents)}</p>
          </div>
          {reserved > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">In open bids (escrow)</p>
              <p className="text-3xl font-extrabold text-gold">{formatAUD(reserved)}</p>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <TopUpButton amount={10000} />
          <Link href="/sell" className="btn-primary">List a card</Link>
        </div>
      </div>

      {/* Open buy orders */}
      <Section title={`Your open buy orders (${buyOrders.length})`}>
        {buyOrders.length === 0 ? (
          <Empty text="You have no open buy orders." cta="wanted" />
        ) : (
          <ul className="divide-y divide-ink-800">
            {buyOrders.map((b) => (
              <li key={b.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <Link href={`/card/${b.card.id}`} className="font-medium text-white hover:text-brand-400">
                    {b.card.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    {b.condition === "ANY" ? (
                      <span className="chip bg-ink-800 text-slate-300">Any cond.</span>
                    ) : (
                      <ConditionBadge condition={b.condition} />
                    )}
                    {b.isFoil && <FoilBadge />}
                    <span className="text-xs text-slate-500">
                      {b.card.collectorNumber} · {b.quantityFilled}/{b.quantity} filled · {timeAgo(b.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-accent">{formatAUD(b.maxPriceCents)}</div>
                  <div className="text-[11px] text-slate-500">{formatAUD(b.reservedCents)} held</div>
                </div>
                <CancelBuyOrderButton id={b.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Active listings */}
      <Section title={`Your active listings (${listings.length})`}>
        {listings.length === 0 ? (
          <Empty text="You have no active listings." cta="sell" />
        ) : (
          <ul className="divide-y divide-ink-800">
            {listings.map((l) => (
              <li key={l.id} className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <Link href={`/card/${l.card.id}`} className="font-medium text-white hover:text-brand-400">
                    {l.card.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <ConditionBadge condition={l.condition} />
                    {l.isFoil && <FoilBadge />}
                    <span className="text-xs text-slate-500">
                      {l.card.collectorNumber} · qty {l.quantity} · {timeAgo(l.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="font-bold text-white">{formatAUD(l.priceCents)}</div>
                <CancelListingButton id={l.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Purchases */}
      <Section title={`Purchase history (${purchases.length})`}>
        {purchases.length === 0 ? (
          <Empty text="You haven't bought anything yet." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {purchases.map((o) => {
              const c = orderCard(o);
              return (
                <li key={o.id} className="flex items-center justify-between p-4">
                  <div>
                    <Link href={`/card/${c.id}`} className="font-medium text-white hover:text-brand-400">
                      {c.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {o.kind === "BUYORDER" ? "buy order filled by" : "from"}{" "}
                      {o.seller.displayName} · {timeAgo(o.createdAt)}
                    </p>
                  </div>
                  <span className="font-bold text-red-400">−{formatAUD(o.totalCents)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Sales */}
      <Section title={`Sales history (${sales.length})`}>
        {sales.length === 0 ? (
          <Empty text="No sales yet." />
        ) : (
          <ul className="divide-y divide-ink-800">
            {sales.map((o) => {
              const c = orderCard(o);
              return (
                <li key={o.id} className="flex items-center justify-between p-4">
                  <div>
                    <Link href={`/card/${c.id}`} className="font-medium text-white hover:text-brand-400">
                      {c.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {o.kind === "BUYORDER" ? "sold into buy order from" : "to"}{" "}
                      {o.buyer.displayName} · {timeAgo(o.createdAt)}
                    </p>
                  </div>
                  <span className="font-bold text-accent">+{formatAUD(o.totalCents)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-surface mt-5 overflow-hidden">
      <h2 className="border-b border-ink-700 p-4 font-bold text-white">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ text, cta }: { text: string; cta?: "sell" | "wanted" }) {
  return (
    <div className="p-8 text-center text-sm text-slate-400">
      {text}
      {cta === "sell" && (
        <div className="mt-3">
          <Link href="/sell" className="btn-primary">List your first card</Link>
        </div>
      )}
      {cta === "wanted" && (
        <div className="mt-3">
          <Link href="/wanted" className="btn-primary">Browse buy orders</Link>
        </div>
      )}
    </div>
  );
}
