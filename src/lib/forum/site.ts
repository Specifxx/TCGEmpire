// RiftCompare's forum settings (the rules are in ./core.ts, docs/forum.md).
import type { ForumSite } from "./core";

export const FORUM_SITE: ForumSite = {
  site: "riftcompare",
  siteName: "RiftCompare",
  repo: "Specifxx/TCGEmpire",
  hosts: ["riftcompare.com", "www.riftcompare.com"],
  base: "/forum",
  topic: "Riftbound",
  intro: "Talk Riftbound prices, deals, decks and collections with other players.",
  categories: [
    { key: "new-sets", name: "New set prices", blurb: "Pre-orders, release week and how a new set's cards are settling.", prompts: ["Is the next booster box worth pre-ordering?", "Which overnumbered cards are holding their price?"] },
    { key: "deals", name: "Deals & where to buy", blurb: "Good prices you spotted, store experiences and shipping tips.", prompts: ["Which store shipped fastest for you?", "Best booster box price you've seen this week"] },
    { key: "collection", name: "Collection talk", blurb: "Pulls, binders, graded cards and what you're chasing.", prompts: ["Your best pull this set (describe it!)", "Grade it or keep it raw?"] },
    { key: "decks", name: "Decks & play", blurb: "Budget builds, staples worth buying and the meta.", prompts: ["Cheapest competitive legend right now?", "Which staples are worth buying early?"] },
    { key: "site", name: "Site feedback", blurb: "Ideas, bugs or a store we should add.", prompts: ["A feature you'd like to see"] },
  ],
  reserved: ["rift compare", "riot"],
};
