// Representative Riftbound "Origins" (OGN) card data for the TCGEmpire MVP.
// This is sample data designed to look and behave like the real set — domain
// assignments and stats are approximate. Real card data can be imported later
// via the JSON importer (see scripts/import-cards.ts).

export interface SeedCard {
  name: string;
  domain: string;
  type: string;
  rarity: string;
  energyCost?: number;
  might?: number;
  tags?: string;
  description?: string;
  flavorText?: string;
  // Reference market price in AUD dollars (converted to cents on seed).
  price: number;
}

export const SEED_CARDS: SeedCard[] = [
  // ---------- FURY ----------
  { name: "Jinx, Loose Cannon", domain: "Fury", type: "Champion", rarity: "Legendary", energyCost: 5, might: 6, tags: "Zaun, Marksman", description: "When Jinx deals damage to a base, draw a card and gain 1 energy.", flavorText: "\"Rules are made to be broken. Like everything else!\"", price: 89.0 },
  { name: "Draven, Glorious Executioner", domain: "Fury", type: "Champion", rarity: "Epic", energyCost: 4, might: 5, tags: "Noxus, Marksman", description: "Whenever Draven kills a unit, create a Spinning Axe.", flavorText: "Welcome to the League of Draven.", price: 42.0 },
  { name: "Annie, Dark Child", domain: "Fury", type: "Champion", rarity: "Epic", energyCost: 3, might: 3, tags: "Mage", description: "Summon Tibbers when Annie deals 4 or more damage in a turn.", flavorText: "A little girl and her bear, against the world.", price: 38.5 },
  { name: "Tryndamere, Barbarian King", domain: "Fury", type: "Champion", rarity: "Rare", energyCost: 5, might: 7, tags: "Freljord, Fighter", description: "Undying: the first time Tryndamere would die each turn, keep it at 1 might instead.", price: 14.0 },
  { name: "Brand, Burning Vengeance", domain: "Fury", type: "Unit", rarity: "Rare", energyCost: 4, might: 4, tags: "Mage, Ablaze", description: "Ablaze: deal 1 damage to all enemy units when Brand enters.", price: 9.5 },
  { name: "Reckless Charge", domain: "Fury", type: "Spell", rarity: "Common", energyCost: 1, tags: "Combat", description: "Give a unit +3 might this turn. It must attack if able.", price: 0.5 },
  { name: "Powder Keg", domain: "Fury", type: "Gear", rarity: "Uncommon", energyCost: 2, tags: "Explosive", description: "Sacrifice: deal 3 damage to target unit.", price: 2.0 },
  { name: "Molten Rune", domain: "Fury", type: "Rune", rarity: "Common", description: "Provides 1 Fury energy.", price: 0.25 },

  // ---------- CALM ----------
  { name: "Ivern, Friend of the Forest", domain: "Calm", type: "Champion", rarity: "Legendary", energyCost: 4, might: 3, tags: "Shurima, Nature", description: "At the start of your turn, grow a Sapling. Saplings give adjacent units +1 might.", flavorText: "The forest remembers a time before men.", price: 76.0 },
  { name: "Nami, Tidecaller", domain: "Calm", type: "Champion", rarity: "Epic", energyCost: 3, might: 2, tags: "Bilgewater, Support", description: "Whenever you play a spell, heal your strongest unit 2.", price: 34.0 },
  { name: "Maokai, Twisted Treant", domain: "Calm", type: "Champion", rarity: "Rare", energyCost: 5, might: 6, tags: "Shadow Isles, Nature", description: "When a friendly unit dies, Maokai gains +1 might permanently.", price: 12.5 },
  { name: "Zyra, Rise of Thorns", domain: "Calm", type: "Unit", rarity: "Rare", energyCost: 3, might: 2, tags: "Plant, Mage", description: "Summon two Thorn Spitters when Zyra enters.", price: 8.0 },
  { name: "Soraka, Starchild", domain: "Calm", type: "Unit", rarity: "Uncommon", energyCost: 2, might: 1, tags: "Support, Heal", description: "At end of turn, heal each friendly unit 1.", price: 3.5 },
  { name: "Bountiful Harvest", domain: "Calm", type: "Spell", rarity: "Uncommon", energyCost: 2, tags: "Growth", description: "Draw 2 cards. Gain 1 energy next turn.", price: 4.0 },
  { name: "Verdant Battlefield", domain: "Calm", type: "Battlefield", rarity: "Epic", tags: "Terrain", description: "Friendly Nature units enter with +1 might.", price: 18.0 },
  { name: "Verdant Rune", domain: "Calm", type: "Rune", rarity: "Common", description: "Provides 1 Calm energy.", price: 0.25 },

  // ---------- MIND ----------
  { name: "Viktor, Machine Herald", domain: "Mind", type: "Champion", rarity: "Mythic", energyCost: 6, might: 5, tags: "Zaun, Augment", description: "Augment: each turn, upgrade Viktor with a Hex Core (+1/+1 and a new keyword).", flavorText: "The glorious evolution awaits.", price: 145.0 },
  { name: "Heimerdinger, Revered Inventor", domain: "Mind", type: "Champion", rarity: "Legendary", energyCost: 5, might: 3, tags: "Piltover, Turret", description: "At the start of combat, deploy an H-28G Turret with 2 might.", price: 64.0 },
  { name: "Zoe, Aspect of Twilight", domain: "Mind", type: "Champion", rarity: "Epic", energyCost: 3, might: 2, tags: "Targon, Trickster", description: "When Zoe enters, copy a spell in your discard to your hand.", price: 40.0 },
  { name: "Orianna, Lady of Clockwork", domain: "Mind", type: "Champion", rarity: "Rare", energyCost: 4, might: 3, tags: "Piltover, Construct", description: "Command the Ball: move it to deal 2 damage or shield a unit each turn.", price: 13.0 },
  { name: "Ekko, Boy Who Shattered Time", domain: "Mind", type: "Unit", rarity: "Epic", energyCost: 4, might: 4, tags: "Zaun, Time", description: "Rewind: once per game, return the board to its state at the start of your turn.", price: 36.0 },
  { name: "Calculated Insight", domain: "Mind", type: "Spell", rarity: "Common", energyCost: 1, tags: "Draw", description: "Scry 2, then draw a card.", price: 0.5 },
  { name: "Hexcore Augment", domain: "Mind", type: "Gear", rarity: "Rare", energyCost: 2, tags: "Augment", description: "Attach to a unit: it gains +1 might and 'Channel: draw a card'.", price: 7.5 },
  { name: "Cerulean Rune", domain: "Mind", type: "Rune", rarity: "Common", description: "Provides 1 Mind energy.", price: 0.25 },

  // ---------- BODY ----------
  { name: "Garen, Might of Demacia", domain: "Body", type: "Champion", rarity: "Legendary", energyCost: 5, might: 7, tags: "Demacia, Fighter", description: "Regeneration: Garen heals 3 at the end of each of your turns. Judgment deals damage equal to his might to a unit.", flavorText: "Demacia!", price: 71.0 },
  { name: "Vi, Piltover Enforcer", domain: "Body", type: "Champion", rarity: "Epic", energyCost: 4, might: 5, tags: "Piltover, Fighter", description: "Vault Breaker: Vi gains Overwhelm and can't be blocked by units with 2 or less might.", price: 44.0 },
  { name: "Braum, Heart of the Freljord", domain: "Body", type: "Champion", rarity: "Epic", energyCost: 4, might: 3, tags: "Freljord, Guardian", description: "Stand Behind Me: friendly units in Braum's row take 1 less damage.", flavorText: "Okay, but you carry the poro.", price: 33.0 },
  { name: "Sett, the Boss", domain: "Body", type: "Champion", rarity: "Rare", energyCost: 5, might: 6, tags: "Ionia, Fighter", description: "Whenever Sett takes damage and survives, he deals that much back when he attacks.", price: 15.5 },
  { name: "Jax, Grandmaster at Arms", domain: "Body", type: "Unit", rarity: "Rare", energyCost: 4, might: 5, tags: "Fighter, Counter", description: "Counter Strike: when blocked, stun the blocking unit.", price: 9.0 },
  { name: "Unbreakable Will", domain: "Body", type: "Spell", rarity: "Uncommon", energyCost: 2, tags: "Combat", description: "A friendly unit can't be killed this turn and gains +0/+4.", price: 3.0 },
  { name: "Titan's Gauntlet", domain: "Body", type: "Gear", rarity: "Uncommon", energyCost: 3, tags: "Equipment", description: "Attach to a unit: +3 might and Overwhelm.", price: 2.5 },
  { name: "Ironclad Rune", domain: "Body", type: "Rune", rarity: "Common", description: "Provides 1 Body energy.", price: 0.25 },

  // ---------- CHAOS ----------
  { name: "Jhin, the Virtuoso", domain: "Chaos", type: "Champion", rarity: "Mythic", energyCost: 5, might: 4, tags: "Ionia, Marksman", description: "Whisper: every 4th damage Jhin deals is lethal, killing the target outright.", flavorText: "Four. The number of beauty.", price: 132.0 },
  { name: "Viego, the Ruined King", domain: "Chaos", type: "Champion", rarity: "Legendary", energyCost: 6, might: 6, tags: "Shadow Isles, Ruined", description: "Sovereign's Domination: when a unit Viego damaged dies, take control of a copy of it.", price: 82.0 },
  { name: "Evelynn, Agony's Embrace", domain: "Chaos", type: "Champion", rarity: "Epic", energyCost: 4, might: 4, tags: "Shadow Isles, Assassin", description: "Camouflage: Evelynn can't be blocked until she attacks a unit below half might.", price: 39.0 },
  { name: "Pyke, Bloodharbor Ripper", domain: "Chaos", type: "Champion", rarity: "Rare", energyCost: 4, might: 4, tags: "Bilgewater, Assassin", description: "Death From Below: if Pyke kills a unit, refund his cost.", price: 16.0 },
  { name: "Shaco, Demon Jester", domain: "Chaos", type: "Unit", rarity: "Rare", energyCost: 3, might: 3, tags: "Assassin, Trickster", description: "Deceive: summon a Hallucination copy with 1 might when Shaco enters.", price: 8.5 },
  { name: "Twisted Bargain", domain: "Chaos", type: "Spell", rarity: "Common", energyCost: 1, tags: "Sacrifice", description: "Destroy a friendly unit. Draw 2 cards.", price: 0.5 },
  { name: "Mist's Call", domain: "Chaos", type: "Spell", rarity: "Uncommon", energyCost: 3, tags: "Revive", description: "Return a unit from your discard to the battlefield with 1 might.", price: 4.5 },
  { name: "Umbral Rune", domain: "Chaos", type: "Rune", rarity: "Common", description: "Provides 1 Chaos energy.", price: 0.25 },

  // ---------- ORDER ----------
  { name: "Lux, Lady of Luminosity", domain: "Order", type: "Champion", rarity: "Legendary", energyCost: 5, might: 4, tags: "Demacia, Mage", description: "Final Spark: spend 6 energy across spells to deal 8 damage in a line.", flavorText: "Knowledge is light, and light, knowledge.", price: 69.0 },
  { name: "Leona, Radiant Dawn", domain: "Order", type: "Champion", rarity: "Epic", energyCost: 4, might: 4, tags: "Targon, Guardian", description: "Daybreak: stun the strongest enemy unit when Leona enters.", price: 41.0 },
  { name: "Kayle, the Righteous", domain: "Order", type: "Champion", rarity: "Epic", energyCost: 6, might: 5, tags: "Demacia, Ascend", description: "Ascend: at 6+ energy spent, Kayle gains Ranged and Invulnerable while attacking.", price: 37.0 },
  { name: "Karma, Enlightened One", domain: "Order", type: "Champion", rarity: "Rare", energyCost: 4, might: 3, tags: "Ionia, Mage", description: "Mantra: your next spell each turn is cast twice.", price: 17.5 },
  { name: "Galio, Colossus", domain: "Order", type: "Unit", rarity: "Rare", energyCost: 6, might: 8, tags: "Demacia, Guardian", description: "Taunt. Reduces magic damage to friendly units by 2.", price: 11.0 },
  { name: "Radiant Blessing", domain: "Order", type: "Spell", rarity: "Common", energyCost: 1, tags: "Heal", description: "Heal a unit 3 and give it +1 might permanently.", price: 0.5 },
  { name: "Aegis of the Legion", domain: "Order", type: "Gear", rarity: "Uncommon", energyCost: 2, tags: "Shield", description: "Friendly units enter with a 2-damage shield.", price: 2.5 },
  { name: "Luminous Rune", domain: "Order", type: "Rune", rarity: "Common", description: "Provides 1 Order energy.", price: 0.25 },

  // ---------- NEUTRAL / LEGENDS ----------
  { name: "The Rift Herald", domain: "Neutral", type: "Legend", rarity: "Mythic", might: 8, tags: "Epic Monster", description: "Once per game, summon the Rift Herald to charge a base, dealing 6 damage.", flavorText: "The Void hungers, and the Rift answers.", price: 118.0 },
  { name: "Baron Nashor", domain: "Neutral", type: "Legend", rarity: "Legendary", might: 9, tags: "Epic Monster", description: "While Baron lives, friendly units have +2 might and Overwhelm.", price: 88.0 },
  { name: "Elder Dragon", domain: "Neutral", type: "Legend", rarity: "Legendary", might: 7, tags: "Epic Monster", description: "Execute: enemy units reduced below 3 might are destroyed.", price: 74.0 },
  { name: "Scuttle Crab", domain: "Neutral", type: "Unit", rarity: "Common", energyCost: 1, might: 1, tags: "Critter", description: "When Scuttle Crab dies, both players draw a card.", flavorText: "Harmless. Mostly.", price: 0.5 },
  { name: "Health Relic", domain: "Neutral", type: "Gear", rarity: "Common", energyCost: 1, tags: "Consumable", description: "Sacrifice: gain 2 energy this turn.", price: 0.5 },
  { name: "Proving Grounds", domain: "Neutral", type: "Battlefield", rarity: "Rare", tags: "Terrain", description: "Both players draw an extra card on their first turn here.", price: 6.0 },
];
