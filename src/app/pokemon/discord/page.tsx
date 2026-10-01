import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { notFoundMetadata } from "@/lib/not-found-metadata";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { pokemonMeta } from "@/lib/pokemon/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";

// The Pokémon Discord app's page: what it answers, how to install it, and its
// privacy notice (#privacy, which the Developer Portal's Privacy Policy URL
// points at). The notice lives here rather than in /privacy so the section
// gains no Riftbound touchpoint, and it describes exactly what
// app/api/pokemon/discord/route.ts logs; change one, change the other.
//
// Static: no data read, so it is built once. That is also why it 404s until
// POKEMON_DISCORD_APP_ID is set: an install button with no app behind it is a
// dead link, and the variable has to be in Vercel BEFORE the release build
// that should show the page (docs/pokemon/README.md, "Discord setup").
// Hand-written copy here names no set and carries no digits (rule 5).

const TITLE = "Pokémon Sealed Price Bot for Discord";
const DESCRIPTION =
  "A Discord app that answers with the cheapest Pokémon sealed listings we track, price per pack and set prices. Its replies carry no affiliate links.";

function discordAppId(): string | null {
  const id = (process.env.POKEMON_DISCORD_APP_ID ?? "").trim();
  return /^\d{5,25}$/.test(id) ? id : null;
}

export function generateMetadata(): Metadata {
  if (!pokemonEnabled() || !discordAppId()) return notFoundMetadata();
  return pokemonMeta({ title: TITLE, description: DESCRIPTION, path: "/pokemon/discord", ogImage: "section" });
}

// integration_type 1 installs to the person's own account, 0 to a server.
// applications.commands is the only scope: the app answers over HTTP and asks
// a server for no permissions.
const installUrl = (appId: string, integrationType: 0 | 1) =>
  `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(appId)}&integration_type=${integrationType}&scope=applications.commands`;

const COMMAND_HELP: { command: string; example: string; what: string }[] = [
  {
    command: "/sealed",
    example: "/sealed product: (start typing, then pick a product) market: United Kingdom",
    what:
      "One product's cheapest listings in the market you choose, cheapest first, with the source named. Below them, the price per booster pack where we know how many packs it holds, TCGplayer's market price as a reference, and the release date TCGplayer lists.",
  },
  {
    command: "/perpack",
    example: "/perpack kind: Booster boxes",
    what:
      "Booster boxes, Elite Trainer Boxes or booster bundles, ranked by the lowest price per pack: the cheapest listing we track divided by the packs inside. Pre-orders are left out.",
  },
  {
    command: "/set",
    example: "/set name: (start typing, then pick a set) market: Canada",
    what: "The cheapest listing of each product type in one set, with the price per pack, and the release date TCGplayer lists.",
  },
];

export default function PokemonDiscordPage() {
  const appId = discordAppId();
  if (!appId) notFound();

  return (
    <div>
      <Breadcrumbs
        trail={[
          { name: "Pokémon", href: "/pokemon" },
          { name: "Discord bot", href: "/pokemon/discord" },
        ]}
      />

      <section className="card-surface mb-6 overflow-hidden border-l-2 border-rose-500 bg-ink-900">
        <div className="px-6 py-6">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{TITLE}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
            Ask Discord what a sealed Pokémon product costs and get the cheapest listings we track without leaving the
            conversation. The bot quotes the same figures as these pages, updated daily, and its replies carry no affiliate
            links, so it suits servers that do not allow them.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <a
                href={installUrl(appId, 1)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Add to my account
              </a>
              <p className="text-xs leading-relaxed text-slate-400">
                Use it in your own DMs, and in any server that lets members use external apps. No admin needed.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={installUrl(appId, 0)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Add to a server
              </a>
              <p className="text-xs leading-relaxed text-slate-400">
                For server admins: everyone in the server can use it. It asks for no permissions beyond its slash commands.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-extrabold text-white">Commands</h2>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {COMMAND_HELP.map((c) => (
            <li key={c.command} className="card-surface flex flex-col gap-2 p-5">
              <h3 className="font-mono text-base font-bold text-white">{c.command}</h3>
              <p className="text-sm leading-relaxed text-slate-300">{c.what}</p>
              <p className="mt-auto break-words rounded-md border border-ink-800 bg-ink-950 px-3 py-2 font-mono text-xs text-slate-300">
                {c.example}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          Every command takes an optional market: the United States (the default), the United Kingdom, the EU, Australia,
          Canada or Singapore. We track no listings in Singapore, so there /sealed and /set show TCGplayer&apos;s market
          price, converted, as a reference, and /perpack has no listings to rank.
        </p>
      </section>

      <section className="card-surface mb-6 p-5">
        <h2 className="text-lg font-extrabold text-white">What a reply shows, and what it leaves out</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>
            Listings, cheapest first by item price, postage extra. A tracked eBay listing sits in its price position and
            shows the postage its seller states.
          </li>
          <li>
            Reference prices below the listings, never mixed in. A figure converted from another currency is marked ≈.
          </li>
          <li>
            The date the prices were read. We update once a day, and Discord keeps a message long after, so every reply
            says how old its figures are.
          </li>
          <li>
            One link, to our page for that product, set or ranking. No affiliate links, no shop links and no images.
          </li>
        </ul>
        <p className="mt-3 text-sm text-slate-400">
          The full comparison, with links to buy, is on{" "}
          <Link href="/pokemon/sealed" className="text-brand-400 hover:underline">
            all Pokémon sealed prices
          </Link>
          .
        </p>
      </section>

      <section id="privacy" className="card-surface scroll-mt-header p-5">
        <h2 className="text-lg font-extrabold text-white">Privacy</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>
            When you run a command, Discord sends us your user ID, the server and channel IDs and the options you chose, as
            it does for every app. The request comes from Discord&apos;s servers, not from your device.
          </li>
          <li>We use them only to answer that command.</li>
          <li>
            Our hosting log records the command&apos;s name, the market and whether it ran in a server, in a DM with the
            app, or in another DM or group DM. It records no IDs.
          </li>
          <li>
            While you type a product or set name, Discord sends what you have typed so far so we can suggest matches. We do
            not log it.
          </li>
          <li>Nothing is stored in a database.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-400">
          Questions about the bot:{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">
            contact us
          </Link>
          . The rest of the site is covered by our{" "}
          <Link href="/privacy" className="text-brand-400 hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
