# RiftCompare — Store Listing (copy-paste ready)

Shared metadata for the Apple App Store and Google Play. Adjust freely.

## Identity

- **App name:** `RiftCompare`
- **Bundle / Application id:** `com.riftcompare.app`
- **Developer / Publisher:** _your name or company_
- **Support email:** `riftcompare@gmail.com`
- **Marketing / support URL:** `https://riftcompare.com`
- **Privacy policy URL:** `https://riftcompare.com/privacy`
- **Category:** Shopping (primary) · Entertainment (secondary)
- **Price:** Free (ad-supported)

## Subtitle / short description (≤ 30 chars Apple, ≤ 80 Google)

> Compare Riftbound card prices

## Promotional text (Apple, ≤ 170 chars)

> Find the cheapest place to buy every Riftbound TCG card. Live prices from stores
> across Australia and the US — updated daily.

## Full description

> **RiftCompare is the fastest way to find the cheapest Riftbound cards.**
>
> Browse the complete Riftbound TCG card database and compare live prices across
> dozens of stores in Australia and the United States — so you always
> know the best place to buy.
>
> **Features**
> • Search every Riftbound card by name, set, rarity, type and domain
> • Live price comparison across multiple retailers, side by side
> • Tap straight through to the cheapest store to buy
> • Build and price-check decks
> • Wishlist the cards you're hunting
> • Switch between AU and US pricing
>
> Prices are sourced from public store listings and may change — always confirm on
> the retailer's site before buying.
>
> Not affiliated with or endorsed by Riot Games.

## Keywords (Apple, ≤ 100 chars, comma-separated)

> riftbound,tcg,card prices,price comparison,league of legends,trading cards,singles,deck,riot

## Content rating

- **Apple age rating:** 4+ (no objectionable content). The app contains
  third-party ads → answer "yes" to ads in the questionnaire.
- **Google content rating:** complete the IARC questionnaire → expect **Everyone**.
  Declare that the app **contains ads**.

## Data safety / privacy answers

The app shows ads via Google AdMob and uses the website's existing accounts.

- **Data collected:** account email (if the user registers), approximate usage
  analytics, and **advertising identifiers** (via AdMob).
- **Advertising ID / tracking:** YES — used for ads (AdMob). On iOS this is gated
  behind the App Tracking Transparency prompt; declining still allows
  non-personalised ads.
- **Encryption in transit:** YES (HTTPS only).
- **Account deletion:** users can contact `riftcompare@gmail.com`; link the
  account/privacy page (`https://riftcompare.com/privacy`).

> Fill these to match what the live site actually collects — keep this in sync
> with `https://riftcompare.com/privacy`.

## Pre-launch checklist

- [ ] Real AdMob App ids set natively (iOS Info.plist + Android strings.xml)
- [ ] Real AdMob banner unit ids set as website env vars + site redeployed
- [ ] `app-ads.txt` published on riftcompare.com (from the AdMob console)
- [ ] Version/build numbers bumped
- [ ] Screenshots captured (see `screenshots.md`)
- [ ] Privacy policy reachable at the URL above
- [ ] Signed build produced (Android `.aab` / iOS archive)
