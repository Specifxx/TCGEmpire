// Posts the day's top "Cheapest on eBay" cards to the RiftCompare Telegram
// channel (lib/telegram-deals.ts). Run by .github/workflows/telegram-deals.yml
// once a day, after the morning import.
//
//   TELEGRAM_BOT_TOKEN   the channel bot's token, from @BotFather
//   TELEGRAM_CHANNEL_ID  @channelname or the numeric -100… id
//   TELEGRAM_MARKET      US (default), AU, UK, SG, CA or EU
//
// Both secrets missing is a green no-op (the channel is not set up yet); a
// refused post fails the run so the ops monitor sees it.
import { COUNTRIES, type Country } from "../src/lib/country";
import { ebayFeedUrl } from "../src/lib/ebay-deals-feed";
import { parseFeedDeals, telegramDealsMessage } from "../src/lib/telegram-deals";

const SITE = "https://riftcompare.com";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chat) {
    console.log("TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is not set: nothing to post.");
    return;
  }
  const up = (process.env.TELEGRAM_MARKET || "US").toUpperCase();
  const market = (up in COUNTRIES ? up : "US") as Country;
  const feed = await fetch(ebayFeedUrl(SITE, market), { headers: { "User-Agent": "RiftCompare-telegram/1" } });
  if (!feed.ok) throw new Error(`The deals feed answered ${feed.status}.`);
  const text = telegramDealsMessage(parseFeedDeals(await feed.text()), COUNTRIES[market].label, SITE);
  if (!text) {
    console.log("No deals in the feed today: nothing posted.");
    return;
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  });
  const body = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!r.ok || !body.ok) throw new Error(`Telegram refused the post (${r.status}): ${body.description ?? "no reason given"}`);
  console.log(`Posted ${market} deals to the channel.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
