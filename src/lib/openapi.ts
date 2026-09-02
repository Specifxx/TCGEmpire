import { SITE_URL } from "@/lib/site";

// Single source of truth for the OpenAPI 3.1 description of RiftCompare's public
// data API. Served at /openapi.json (canonical) and /api/v1/openapi.json (kept
// working for anything that already linked the old location) — both routes just
// return this object, so the two can never drift apart.
//
// SCOPE: every route here is read-only, requires no API key, and is reachable
// with CORS wide open (Access-Control-Allow-Origin: *) specifically so it can be
// called from a browser or an agent runtime with no server-side proxy. The
// exceptions are called out per-path: /api/cards without ?market= and
// /api/card/{id} follow the visitor's cookie/geo market and are not meaningfully
// cacheable or agent-callable in that mode — see their descriptions.
//
// RATE LIMITS: none of these routes currently enforce one (see lib/rate-limit.ts
// for the limiter this codebase DOES use, on auth/abuse-prone write endpoints —
// it is deliberately not wired up here). Vercel's own infrastructure may still
// throttle or block abusive traffic without notice. Be a good citizen: the
// Cache-Control header on every response states exactly how long a result is
// good for — cache accordingly rather than polling.
const MARKET_ENUM = ["AU", "US", "UK", "SG", "CA", "EU"] as const;

const MARKET_PARAM = {
  name: "market",
  in: "query",
  required: false,
  schema: { type: "string", enum: MARKET_ENUM, default: "US" },
  description: "Market scope. Determines which stores, currency and shipping estimates the response reflects.",
};

const CARD_ID_PARAM = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "The card's URL slug (e.g. \"vayne-hunter-sfd-223-221\") or its raw id. Either resolves the same card.",
};

const MONEY_CENTS = { type: "integer", description: "Amount in integer minor units (cents) — never a float." };
const CURRENCY = { type: "string", description: "ISO 4217 currency code, e.g. \"USD\"." };
const NOT_FOUND_RESPONSE = {
  description: "No card matches the given id/slug.",
  content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } } } } },
};

// The {status, market, asOf, entries/cards} shape both /index.json and
// /cards.json return instead of a 5xx while their underlying data hasn't
// accumulated enough history yet (a brand-new market, a fresh deploy). See each
// route's own comment for why this replaced a 503.
function warmingSchema(dataKey: string) {
  return {
    type: "object",
    properties: {
      status: { type: "string", enum: ["warming"] },
      market: { type: "string" },
      asOf: { type: "string", format: "date-time" },
      [dataKey]: { type: "array", items: {}, maxItems: 0 },
    },
    required: ["status", "market", "asOf", dataKey],
  };
}

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "RiftCompare Data API",
      version: "1.1.0",
      description:
        "Public, read-only Riftbound: League of Legends TCG price data — the RiftCompare Index, whole-catalog " +
        "price summaries, per-card search/lookup/history and store-by-store listings (including real total " +
        "delivered cost — item price plus shipping), and sealed-product prices, all by market.\n\n" +
        "**Authentication: none.** Every endpoint below is open — no API key, no account, no signed request. " +
        "**Rate limits: none enforced today.** Cache responses for at least as long as their `Cache-Control` " +
        "header says; infrastructure-level throttling may apply to abusive traffic without notice.\n\n" +
        "Free to use, with attribution to RiftCompare (https://riftcompare.com).",
      contact: { url: `${SITE_URL}/market#cite` },
    },
    servers: [{ url: SITE_URL }],
    paths: {
      "/api/v1/index.json": {
        get: {
          operationId: "getIndex",
          summary: "The RiftCompare Index — level, deltas, key stats and constituents.",
          parameters: [MARKET_PARAM],
          responses: {
            "200": {
              description:
                "The index snapshot (`status: \"ready\"`), or a `status: \"warming\"` placeholder if this " +
                "market doesn't have enough price history yet — never a 5xx for that case.",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      {
                        type: "object",
                        properties: {
                          status: { type: "string", enum: ["ready"] },
                          name: { type: "string" },
                          description: { type: "string" },
                          market: { type: "string" },
                          base: { type: "integer", enum: [100] },
                          startDay: { type: "string", format: "date" },
                          level: { type: "number" },
                          currency: CURRENCY,
                          change: {
                            type: "object",
                            properties: {
                              d1: { type: ["number", "null"] },
                              d7: { type: ["number", "null"] },
                              d30: { type: ["number", "null"] },
                              sinceStart: { type: ["number", "null"] },
                            },
                          },
                          stats: { type: ["object", "null"] },
                          constituents: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                name: { type: "string" },
                                setCode: { type: "string" },
                                collectorNumber: { type: "string" },
                                weightPct: { type: "number" },
                                priceCents: MONEY_CENTS,
                                d7pct: { type: ["number", "null"] },
                                url: { type: "string", format: "uri" },
                              },
                            },
                          },
                          source: { type: "string", format: "uri" },
                          license: { type: "string", format: "uri" },
                          generatedAt: { type: "string", format: "date-time" },
                        },
                        required: ["status", "market", "level", "currency", "constituents"],
                      },
                      warmingSchema("entries"),
                    ],
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/cards.json": {
        get: {
          operationId: "getCardsSummary",
          summary: "Whole-catalog price summary for one market: latest price + 1/7/30-day deltas per card.",
          parameters: [MARKET_PARAM],
          responses: {
            "200": {
              description: "Per-card summaries (`status: \"ready\"`), or `status: \"warming\"` while sparse.",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      {
                        type: "object",
                        properties: {
                          status: { type: "string", enum: ["ready"] },
                          market: { type: "string" },
                          currency: CURRENCY,
                          note: { type: "string" },
                          generatedAt: { type: "string", format: "date-time" },
                          cards: {
                            type: "array",
                            items: {
                              type: "object",
                              description: "One row per tracked card. priceCents/d*Cents are null when no in-stock listing covers that point.",
                              properties: {
                                id: { type: "string" },
                                slug: { type: ["string", "null"] },
                                name: { type: "string" },
                                setCode: { type: "string" },
                                collectorNumber: { type: "string" },
                                priceCents: { type: ["integer", "null"] },
                                d1Cents: { type: ["integer", "null"] },
                                d7Cents: { type: ["integer", "null"] },
                                d30Cents: { type: ["integer", "null"] },
                              },
                            },
                          },
                        },
                      },
                      warmingSchema("cards"),
                    ],
                  },
                },
              },
            },
          },
        },
      },
      "/api/v1/card/{id}/prices.json": {
        get: {
          operationId: "getCardPrices",
          summary: "Lowest live in-stock price in EVERY market (AU/US/UK/SG/CA) for one card, in a single response.",
          description:
            "Returns all five markets at once — there is no ?market= param here because there's no need for one; " +
            "filter the `prices` object client-side for the market you want.",
          parameters: [CARD_ID_PARAM],
          responses: {
            "200": {
              description: "Per-market lowest price.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      card: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          set: { type: "string" },
                          setCode: { type: "string" },
                          collectorNumber: { type: "string" },
                          url: { type: "string", format: "uri" },
                          image: { type: ["string", "null"], format: "uri" },
                        },
                      },
                      prices: {
                        type: "object",
                        description: "One entry per market code (AU/US/UK/SG/CA).",
                        additionalProperties: {
                          type: "object",
                          properties: { lowestCents: { type: ["integer", "null"] }, currency: CURRENCY },
                        },
                      },
                      note: { type: "string" },
                      source: { type: "string", format: "uri" },
                      generatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "404": NOT_FOUND_RESPONSE,
          },
        },
      },
      "/api/v1/card/{id}/listings.json": {
        get: {
          operationId: "getCardListings",
          summary: "Every tracked store's live listing for one card, cheapest item price first — the cheapest-listing / total-delivered-cost endpoint.",
          description:
            "The full multi-vendor comparison table as JSON. `listings[0]` is the cheapest in-stock item price " +
            "(ties broken by delivered cost); each row also carries `ship` (effective shipping estimate, real " +
            "figure where the source provides one, otherwise the store's documented flat estimate) and " +
            "`delivered` (priceCents + ship) for a consumer that wants to rank by total cost instead of item " +
            "price alone — that ranking is RiftCompare's whole differentiator.",
          parameters: [CARD_ID_PARAM, MARKET_PARAM],
          responses: {
            "200": {
              description: "Per-store listings, cheapest first.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      market: { type: "string" },
                      currency: CURRENCY,
                      storeCount: { type: "integer" },
                      hasEbay: { type: "boolean" },
                      listings: {
                        type: "array",
                        description: "In-stock rows, cheapest item price first.",
                        items: {
                          type: "object",
                          properties: {
                            retailer: { type: "string" },
                            retailerName: { type: "string" },
                            priceCents: MONEY_CENTS,
                            ship: { type: ["integer", "null"], description: "Effective shipping estimate, or null if genuinely unknown (\"at checkout\")." },
                            delivered: { type: "integer", description: "priceCents + (ship ?? 0) — total delivered cost." },
                            condition: { type: ["string", "null"] },
                            isFoil: { type: "boolean" },
                            inStock: { type: "boolean" },
                            lastSeen: { type: "string", format: "date-time" },
                            buyHref: { type: "string", format: "uri" },
                            policyUrl: { type: ["string", "null"], format: "uri" },
                          },
                        },
                      },
                      outOfStock: { type: "array", items: { type: "object" } },
                      source: { type: "string", format: "uri" },
                      generatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "404": NOT_FOUND_RESPONSE,
          },
        },
      },
      "/api/v1/card/{id}/history.json": {
        get: {
          operationId: "getCardHistory",
          summary: "Daily price series for one card, in one market (up to 120 days).",
          parameters: [CARD_ID_PARAM, MARKET_PARAM],
          responses: {
            "200": {
              description: "Daily points, oldest first.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      slug: { type: ["string", "null"] },
                      name: { type: "string" },
                      market: { type: "string" },
                      currency: CURRENCY,
                      url: { type: "string", format: "uri" },
                      points: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { day: { type: "string", format: "date" }, priceCents: { type: "integer" } },
                        },
                      },
                      generatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
            "404": NOT_FOUND_RESPONSE,
          },
        },
      },
      "/api/v1/sealed.json": {
        get: {
          operationId: "getSealedGroups",
          summary: "Sealed-product (booster box/pack/bundle) groups for one market, cheapest store per product.",
          parameters: [MARKET_PARAM],
          responses: {
            "200": {
              description: "Sealed product groups.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      market: { type: "string" },
                      currency: CURRENCY,
                      generatedAt: { type: "string", format: "date-time" },
                      groups: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/cards": {
        get: {
          operationId: "searchCards",
          summary: "Card search — free-text query, facet filters, sort and pagination.",
          description:
            "Powers the /browse grid. **Pass `?market=` to use this cross-origin or from an agent**: without it, " +
            "prices follow the caller's `country` cookie (which an agent has none of) and the response is " +
            "private/uncached. With an explicit market, the response is deterministic and publicly cacheable — " +
            "this is the documented, supported way to call it. `ids=<comma-separated>` is a separate lookup " +
            "mode (returns exactly those cards, in that order) used internally and not covered below.",
          parameters: [
            { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Free-text search (name, collector number)." },
            MARKET_PARAM,
            { name: "domain", in: "query", required: false, schema: { type: "string" }, description: "Filter by domain (Fury/Calm/Mind/Body/Chaos/Order)." },
            { name: "rarity", in: "query", required: false, schema: { type: "string" } },
            { name: "type", in: "query", required: false, schema: { type: "string" }, description: "Card type (Unit/Spell/Gear/Rune/Battlefield/Legend)." },
            { name: "set", in: "query", required: false, schema: { type: "string" }, description: "Set code, e.g. \"VEN\"." },
            { name: "min", in: "query", required: false, schema: { type: "integer" }, description: "Minimum price, in cents." },
            { name: "max", in: "query", required: false, schema: { type: "integer" }, description: "Maximum price, in cents." },
            { name: "sort", in: "query", required: false, schema: { type: "string" } },
            { name: "page", in: "query", required: false, schema: { type: "integer", default: 1 } },
          ],
          responses: {
            "200": {
              description: "A page of matching cards, in the requested market's price columns.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { cards: { type: "array", items: { type: "object" } }, page: { type: "integer" } },
                  },
                },
              },
            },
          },
        },
      },
      "/api/card/{id}": {
        get: {
          operationId: "getCard",
          summary: "Single-card lookup — full identity, artwork and every tracked retailer/eBay listing across all markets.",
          parameters: [CARD_ID_PARAM],
          responses: {
            "200": {
              description: "Card detail, retailer prices (all markets) and eBay carousel/graded data.",
              content: { "application/json": { schema: { type: "object" } } },
            },
            "404": NOT_FOUND_RESPONSE,
          },
        },
      },
    },
  } as const;
}
