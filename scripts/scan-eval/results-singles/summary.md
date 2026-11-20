# TCG Singles DB card scanner: image coverage and accuracy, 2026-11-20

Model claude-haiku-5-5 (one read a photo) + TCG Singles DB's matcher. Pass: found >= 95% and wrong match <= 1%.

## pokemon: NOT YET

Image coverage: 98.4% of 700 sampled US$1+ cards and 99.0% of 300 sampled cards of any price have a real picture (placeholders 0, missing 14). 28272 of 28875 cards carry a printed number.

750 images of 150 cards (1 sampled cards had no picture). Errors 0. Median model time 1.40 s. Picker median 4 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 750 | 83.5% | 70.5% | 1.1% | 13.7% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| glare | 150 | 82.7% | 73.3% | 2.7% | 12.0% |
| foil sheen | 150 | 86.7% | 74.0% | 0.7% | 10.7% |
| tilted on a table | 150 | 89.3% | 78.0% | 0.7% | 8.7% |
| far and small | 150 | 76.0% | 58.0% | 0.7% | 22.0% |
| dim light | 150 | 82.7% | 69.3% | 0.7% | 15.3% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 82.6% | 78.5% | 0.0% | 14.4% |
| look-alike | 295 | 81.4% | 62.7% | 2.7% | 14.9% |
| any | 115 | 91.3% | 67.0% | 0.0% | 8.7% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| Leafeon | BW87 | tilted on a table | none | {"isTradingCard":true,"game":"pokemon","name":"Leafeon","setCode":"BW","collectorNumber":"BW07","promoStamp":true,"language":"en","firstEdition":false} |
| Leafeon | BW87 | glare | none | {"isTradingCard":true,"game":"pokemon","name":"Leafeon","setCode":"BW","collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Leafeon | BW87 | dim light | none | {"isTradingCard":true,"game":"pokemon","name":"Leafeon","setCode":"BW","collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Leafeon | BW87 | foil sheen | none | {"isTradingCard":true,"game":"pokemon","name":"Leafeon","setCode":"BW","collectorNumber":"BW07","promoStamp":true,"language":"en","firstEdition":false} |
| Leafeon | BW87 | far and small | none | {"isTradingCard":true,"game":"pokemon","name":"Leafeon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Mewtwo (Movie Promo) | 03/53 | tilted on a table | none | {"isTradingCard":true,"game":"pokemon","name":"Mewtwo","setCode":null,"collectorNumber":"3","promoStamp":true,"language":"en","firstEdition":false} |
| Mewtwo (Movie Promo) | 03/53 | glare | none | {"isTradingCard":true,"game":"pokemon","name":"Mewtwo","setCode":null,"collectorNumber":"3","promoStamp":true,"language":"en","firstEdition":false} |
| Mewtwo (Movie Promo) | 03/53 | dim light | none | {"isTradingCard":true,"game":"pokemon","name":"Mewtwo","setCode":null,"collectorNumber":"150","promoStamp":false,"language":"en","firstEdition":false} |
| Mewtwo (Movie Promo) | 03/53 | foil sheen | none | {"isTradingCard":true,"game":"pokemon","name":"Mewtwo","setCode":null,"collectorNumber":"3","promoStamp":true,"language":"en","firstEdition":false} |
| Mewtwo (Movie Promo) | 03/53 | far and small | none | {"isTradingCard":true,"game":"pokemon","name":"Mewtwo","setCode":null,"collectorNumber":"8/130","promoStamp":true,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | tilted on a table | none | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | dim light | none | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | foil sheen | none | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | far and small | none | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | glare | none | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Garbodor (119 Secret Rare) | 119/116 | far and small | none | {"isTradingCard":true,"game":"pokemon","name":"Garbodor","setCode":null,"collectorNumber":"118/116","promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | tilted on a table | none | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | glare | none | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | foil sheen | none | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | dim light | none | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |

## yugioh: NOT YET

Image coverage: 98.6% of 700 sampled US$1+ cards and 99.7% of 300 sampled cards of any price have a real picture (placeholders 0, missing 11). 46685 of 46701 cards carry a printed number.

750 images of 150 cards (1 sampled cards had no picture). Errors 0. Median model time 1.43 s. Picker median 6 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 750 | 83.1% | 42.9% | 0.0% | 12.9% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| dim light | 150 | 81.3% | 40.0% | 0.0% | 14.7% |
| foil sheen | 150 | 86.0% | 48.0% | 0.0% | 10.0% |
| far and small | 150 | 79.3% | 36.0% | 0.0% | 15.3% |
| tilted on a table | 150 | 84.7% | 45.3% | 0.0% | 12.0% |
| glare | 150 | 84.0% | 45.3% | 0.0% | 12.7% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 76.8% | 52.4% | 0.0% | 21.2% |
| look-alike | 295 | 85.8% | 27.5% | 0.0% | 8.5% |
| any | 115 | 94.8% | 54.8% | 0.0% | 0.0% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| The Winged Dragon of Ra | JUMP-EN045 | dim light | none | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| The Winged Dragon of Ra | JUMP-EN045 | foil sheen | none | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| The Winged Dragon of Ra | JUMP-EN045 | far and small | none | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | tilted on a table | none | {"isTradingCard":true,"game":"yugioh","name":"Number 39: Utopia Ray V","setCode":"PGL3","collectorNumber":"PGL3-EN008","promoStamp":false,"language":"en","firstEdition":true} |
| The Winged Dragon of Ra | JUMP-EN045 | glare | none | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| The Winged Dragon of Ra | JUMP-EN045 | tilted on a table | none | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | glare | none | {"isTradingCard":true,"game":"yugioh","name":"Number 39: Utopia Ray Victory","setCode":"PGL3","collectorNumber":"PGL3-EN008","promoStamp":false,"language":"en","firstEdition":true} |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | dim light | none | {"isTradingCard":true,"game":"yugioh","name":"Number 39: Utopia the Lightning","setCode":"PGL3","collectorNumber":"PGL3-EN006","promoStamp":false,"language":"en","firstEdition":tru |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | foil sheen | pick | {"isTradingCard":true,"game":"yugioh","name":"Number 39: Utopia Ray Dragon Titan Galaxy","setCode":"PGL3","collectorNumber":"PGL3-EN008","promoStamp":false,"language":"en","firstEd |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Number 86: Heroic Champion - Rhongomiant","setCode":"PGL","collectorNumber":"PGL3-EN008","promoStamp":false,"language":"en","firstEdit |
| Armed Dragon LV7 | DR3-EN015 | tilted on a table | none | {"isTradingCard":true,"game":"yugioh","name":"Armed Dragon LV7","setCode":null,"collectorNumber":"DRL3-EN011","promoStamp":false,"language":"en","firstEdition":false} |
| Armed Dragon LV7 | DR3-EN015 | glare | none | {"isTradingCard":true,"game":"yugioh","name":"Armed Dragon LV7","setCode":"DR3","collectorNumber":"DR3-EN011","promoStamp":false,"language":"en","firstEdition":false} |
| Armed Dragon LV7 | DR3-EN015 | dim light | none | {"isTradingCard":true,"game":"yugioh","name":"Armed Dragon LV7","setCode":"GLAS","collectorNumber":"GLAS-EN015","promoStamp":false,"language":"en","firstEdition":false} |
| Armed Dragon LV7 | DR3-EN015 | foil sheen | none | {"isTradingCard":true,"game":"yugioh","name":"Armed Dragon LV7","setCode":"DR3","collectorNumber":"DR3-EN011","promoStamp":false,"language":"en","firstEdition":false} |
| Heavy Storm | DLG1-EN049 | tilted on a table | none | {"isTradingCard":true,"game":"yugioh","name":"Heavy Storm","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Armed Dragon LV7 | DR3-EN015 | far and small | none | {"isTradingCard":true,"game":"yugioh","name":"Armed Dragon LV7","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Heavy Storm | DLG1-EN049 | dim light | none | {"isTradingCard":true,"game":"yugioh","name":"Heavy Storm","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Heavy Storm | DLG1-EN049 | glare | none | {"isTradingCard":true,"game":"yugioh","name":"Heavy Storm","setCode":null,"collectorNumber":"LOB-EN056","promoStamp":false,"language":"en","firstEdition":false} |
| Heavy Storm | DLG1-EN049 | foil sheen | none | {"isTradingCard":true,"game":"yugioh","name":"Heavy Storm","setCode":"LOB","collectorNumber":"LOB-EN001","promoStamp":false,"language":"en","firstEdition":false} |
| Heavy Storm | DLG1-EN049 | far and small | none | {"isTradingCard":true,"game":"yugioh","name":"Heavy Storm","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |

## one-piece: NOT YET

Image coverage: 98.0% of 700 sampled US$1+ cards and 96.0% of 300 sampled cards of any price have a real picture (placeholders 3, missing 23). 7278 of 7519 cards carry a printed number.

755 images of 151 cards (0 sampled cards had no picture). Errors 0. Median model time 1.43 s. Picker median 3 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 755 | 77.5% | 57.1% | 16.3% | 6.1% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| glare | 151 | 82.1% | 60.3% | 17.2% | 0.7% |
| dim light | 151 | 76.2% | 57.6% | 17.2% | 6.6% |
| foil sheen | 151 | 80.1% | 59.6% | 17.9% | 2.0% |
| tilted on a table | 151 | 80.1% | 59.6% | 18.5% | 1.3% |
| far and small | 151 | 68.9% | 48.3% | 10.6% | 19.9% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 96.8% | 95.6% | 0.0% | 3.2% |
| look-alike | 300 | 50.0% | 9.0% | 39.3% | 10.3% |
| any | 115 | 92.2% | 68.7% | 4.3% | 3.5% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| Yamato (001) | ST09-001 | far and small | none | {"isTradingCard":true,"game":"one piece","name":"Yamato","setCode":"ST09","collectorNumber":"ST09-011","promoStamp":false,"language":"en","firstEdition":false} |
| Boa Hancock (Sealed Battle 2024 Vol. 2) | P-066 | far and small | none | {"isTradingCard":true,"game":"one piece","name":"Boa Hancock","setCode":null,"collectorNumber":"P-090","promoStamp":true,"language":"en","firstEdition":false} |
| Trafalgar Law (Illustration Box Vol.6) | P-093 | far and small | none | {"isTradingCard":true,"game":"one piece","name":"Trafalgar Law","setCode":null,"collectorNumber":"P-082","promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | tilted on a table | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | dim light | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":null,"firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | foil sheen | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Pirates Party Vol. 3) | P-035 | far and small | none | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":null,"collectorNumber":"P-032","promoStamp":true,"language":"en","firstEdition":false} |
| Portgas.D.Ace (Premium Card Collection -Flame-Flame Fruit Coliseum Edition-) | P-153 | far and small | none | {"isTradingCard":true,"game":"one piece","name":"Portgas.D.Ace","setCode":null,"collectorNumber":"P-100","promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (001) | ST08-001 | dim light | none | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":"ST06","collectorNumber":"ST06-001","promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Premium Card Collection -Flame-Flame Fruit Coliseum Edition-) | P-154 | far and small | none | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":null,"collectorNumber":"P-054","promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Pirates Party 2026 Vol. 3) | P-157 | far and small | none | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":"P","collectorNumber":"P-197","promoStamp":true,"language":"en","firstEdition":false} |
| Yosaku & Johnny | OP03-053 | tilted on a table | match WRONG | {"isTradingCard":true,"game":"one piece","name":"Yosaku & Johnny","setCode":"OP03","collectorNumber":"OP03-053","promoStamp":true,"language":"en","firstEdition":false} |
| Yosaku & Johnny | OP03-053 | glare | match WRONG | {"isTradingCard":true,"game":"one piece","name":"Yosaku & Johnny","setCode":"OP03","collectorNumber":"OP03-053","promoStamp":true,"language":"en","firstEdition":false} |
| Yosaku & Johnny | OP03-053 | dim light | match WRONG | {"isTradingCard":true,"game":"one piece","name":"Yosaku & Johnny","setCode":"OP03","collectorNumber":"OP03-053","promoStamp":true,"language":"en","firstEdition":false} |
| Yosaku & Johnny | OP03-053 | foil sheen | match WRONG | {"isTradingCard":true,"game":"one piece","name":"Yosaku & Johnny","setCode":"OP03","collectorNumber":"OP03-053","promoStamp":true,"language":"en","firstEdition":false} |
| Yosaku & Johnny | OP03-053 | far and small | match WRONG | {"isTradingCard":true,"game":"one piece","name":"Yosaku & Johnny","setCode":"OP03","collectorNumber":"OP03-053","promoStamp":true,"language":"en","firstEdition":false} |
| Shirahoshi (October Championship 2024 Online Regional) | OP03-116 | tilted on a table | match WRONG | {"isTradingCard":true,"game":"one piece","name":"Shirahoshi","setCode":"OP03","collectorNumber":"OP03-116","promoStamp":true,"language":"en","firstEdition":false} |
| Shirahoshi (October Championship 2024 Online Regional) | OP03-116 | glare | none | {"isTradingCard":true,"game":"one piece","name":"Shirahoshi","setCode":"OP03","collectorNumber":"OP03-118","promoStamp":true,"language":"en","firstEdition":false} |
| Shirahoshi (October Championship 2024 Online Regional) | OP03-116 | foil sheen | none | {"isTradingCard":true,"game":"one piece","name":"Shirahoshi","setCode":"OP03","collectorNumber":"OP03-115","promoStamp":true,"language":"en","firstEdition":false} |
| Shirahoshi (October Championship 2024 Online Regional) | OP03-116 | dim light | none | {"isTradingCard":true,"game":"one piece","name":"Shirahoshi","setCode":"OP03","collectorNumber":"OP03-119","promoStamp":true,"language":"en","firstEdition":false} |
