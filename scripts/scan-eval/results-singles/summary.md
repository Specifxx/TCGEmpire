# TCG Singles DB card scanner: image coverage and accuracy, 2026-11-20

Model claude-haiku-5-5 (one read a photo) + TCG Singles DB's matcher. Pass: found >= 95% and wrong match <= 1%.

## pokemon: NOT YET

Image coverage: 98.4% of 700 sampled US$1+ cards and 99.0% of 300 sampled cards of any price have a real picture (placeholders 0, missing 14). 28272 of 28875 cards carry a printed number.

750 images of 150 cards (1 sampled cards had no picture). Errors 0. Median model time 1.32 s. Picker median 9 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 750 | 87.6% | 70.4% | 0.1% | 0.7% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| tilted on a table | 150 | 90.7% | 77.3% | 0.0% | 0.7% |
| far and small | 150 | 79.3% | 48.7% | 0.0% | 0.7% |
| glare | 150 | 91.3% | 78.7% | 0.0% | 0.7% |
| dim light | 150 | 86.7% | 70.7% | 0.7% | 0.7% |
| foil sheen | 150 | 90.0% | 76.7% | 0.0% | 0.7% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 87.1% | 81.2% | 0.3% | 0.0% |
| look-alike | 295 | 85.8% | 59.3% | 0.0% | 1.7% |
| any | 115 | 93.9% | 67.0% | 0.0% | 0.0% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| Leafeon | BW87 | dim light | pick | {"isTradingCard":true,"game":"pokemon","name":"Leafeon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Leafeon | BW87 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Leafeon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Mewtwo (Movie Promo) | 03/53 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Mewtwo","setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Mewtwo (Movie Promo) | 03/53 | dim light | match WRONG | {"isTradingCard":true,"game":"pokemon","name":"Mewtwo","setCode":null,"collectorNumber":"150","promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | glare | pick | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | tilted on a table | pick | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | dim light | pick | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Deoxys EX (Team Plasma) | BW82 | foil sheen | pick | {"isTradingCard":true,"game":"pokemon","name":"Deoxys EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | tilted on a table | pick | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | glare | pick | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | dim light | pick | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | foil sheen | pick | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Flareon | BW88 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Flareon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Lillipup | BW52 | tilted on a table | pick | {"isTradingCard":true,"game":"pokemon","name":"Lillipup","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Lillipup | BW52 | dim light | pick | {"isTradingCard":true,"game":"pokemon","name":"Lillipup","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Lillipup | BW52 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Lillipup","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Lillipup | BW52 | foil sheen | pick | {"isTradingCard":true,"game":"pokemon","name":"Lillipup","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Thundurus EX (Team Plasma) | BW81 | dim light | pick | {"isTradingCard":true,"game":"pokemon","name":"Thundurus EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Thundurus EX (Team Plasma) | BW81 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Thundurus EX","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |

## yugioh: NOT YET

Image coverage: 98.6% of 700 sampled US$1+ cards and 99.7% of 300 sampled cards of any price have a real picture (placeholders 0, missing 11). 46685 of 46701 cards carry a printed number.

750 images of 150 cards (1 sampled cards had no picture). Errors 0. Median model time 1.36 s. Picker median 7 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 750 | 91.7% | 46.9% | 0.0% | 2.0% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| glare | 150 | 92.7% | 49.3% | 0.0% | 2.7% |
| tilted on a table | 150 | 92.0% | 50.0% | 0.0% | 2.0% |
| foil sheen | 150 | 93.3% | 53.3% | 0.0% | 0.7% |
| far and small | 150 | 89.3% | 39.3% | 0.0% | 3.3% |
| dim light | 150 | 91.3% | 42.7% | 0.0% | 1.3% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 92.6% | 59.4% | 0.0% | 2.1% |
| look-alike | 295 | 88.5% | 27.8% | 0.0% | 2.7% |
| any | 115 | 97.4% | 59.1% | 0.0% | 0.0% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| The Winged Dragon of Ra | JUMP-EN045 | glare | pick | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| The Winged Dragon of Ra | JUMP-EN045 | tilted on a table | pick | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| The Winged Dragon of Ra | JUMP-EN045 | foil sheen | pick | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| The Winged Dragon of Ra | JUMP-EN045 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| The Winged Dragon of Ra | JUMP-EN045 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"The Winged Dragon of Ra","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | tilted on a table | none | {"isTradingCard":true,"game":"yugioh","name":"Number 36: Shadow Sword Dragon, Titanic Galaxy","setCode":"PGL3","collectorNumber":null,"promoStamp":false,"language":"en","firstEditi |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | glare | pick | {"isTradingCard":true,"game":"yugioh","name":"Number 39: Utopia Ray Victory","setCode":"PGL3","collectorNumber":"PGL3-EN008","promoStamp":false,"language":"en","firstEdition":true} |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | foil sheen | pick | {"isTradingCard":true,"game":"yugioh","name":"Number 39: Utopia Ray","setCode":"PGL3","collectorNumber":"PGL3-EN008","promoStamp":false,"language":"en","firstEdition":true} |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"Number 39: Utopia Ray Lancer","setCode":"PGL3","collectorNumber":"PGL3-EN008","promoStamp":false,"language":"en","firstEdition":true} |
| Number 38: Hope Harbinger Dragon Titanic Galaxy | PGL3-EN008 | far and small | none | {"isTradingCard":true,"game":"yugioh","name":"Number 94: Ghost Rabbit Dragon Titanic Galaxy","setCode":"PGL3","collectorNumber":null,"promoStamp":false,"language":"en","firstEditio |
| R - Righteous Justice | RYMP-EN025 | tilted on a table | none | {"isTradingCard":true,"game":"yugioh","name":"R - Righteous Justice","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| R - Righteous Justice | RYMP-EN025 | glare | none | {"isTradingCard":true,"game":"yugioh","name":"R - Righteous Justice","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| R - Righteous Justice | RYMP-EN025 | dim light | none | {"isTradingCard":true,"game":"yugioh","name":"R - Righteous Justice","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| R - Righteous Justice | RYMP-EN025 | foil sheen | none | {"isTradingCard":true,"game":"yugioh","name":"R - Righteous Justice","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| R - Righteous Justice | RYMP-EN025 | far and small | none | {"isTradingCard":true,"game":"yugioh","name":"R - Righteous Justice","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Blackwing - Sirocco the Dawn | GLD3-EN023 | tilted on a table | pick | {"isTradingCard":true,"game":"yugioh","name":"Blackwing - Sirocco the Dawn","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Blackwing - Sirocco the Dawn | GLD3-EN023 | glare | pick | {"isTradingCard":true,"game":"yugioh","name":"Blackwing - Sirocco the Dawn","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Blackwing - Sirocco the Dawn | GLD3-EN023 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"Blackwing - Sirocco the Dawn","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Blackwing - Sirocco the Dawn | GLD3-EN023 | foil sheen | pick | {"isTradingCard":true,"game":"yugioh","name":"Blackwing - Sirocco the Dawn","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Blackwing - Sirocco the Dawn | GLD3-EN023 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Blackwing - Sirocco the Dawn","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |

## one-piece: PASS

Image coverage: 98.0% of 700 sampled US$1+ cards and 96.0% of 300 sampled cards of any price have a real picture (placeholders 3, missing 23). 7278 of 7519 cards carry a printed number.

755 images of 151 cards (0 sampled cards had no picture). Errors 0. Median model time 1.31 s. Picker median 4 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 755 | 97.1% | 58.0% | 0.0% | 0.5% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| foil sheen | 151 | 99.3% | 59.6% | 0.0% | 0.7% |
| tilted on a table | 151 | 99.3% | 59.6% | 0.0% | 0.7% |
| glare | 151 | 100.0% | 59.6% | 0.0% | 0.0% |
| dim light | 151 | 98.0% | 58.3% | 0.0% | 0.7% |
| far and small | 151 | 88.7% | 53.0% | 0.0% | 0.7% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 97.6% | 96.8% | 0.0% | 1.2% |
| look-alike | 300 | 96.3% | 9.3% | 0.0% | 0.0% |
| any | 115 | 97.4% | 70.4% | 0.0% | 0.0% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| Trafalgar Law (Illustration Box Vol.6) | P-093 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Trafalgar Law","setCode":null,"collectorNumber":"P-082","promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | tilted on a table | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | dim light | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | foil sheen | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | far and small | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Pirates Party Vol. 3) | P-035 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":"P","collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Portgas.D.Ace (Premium Card Collection -Flame-Flame Fruit Coliseum Edition-) | P-153 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Portgas.D.Ace","setCode":null,"collectorNumber":"P-100","promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Premium Card Collection -Flame-Flame Fruit Coliseum Edition-) | P-154 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":"P","collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Kouzuki Momonosuke (Premium Card Collection -Best Selection Vol. 4-) | OP10-028 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Kouzuki Momonosuke","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Sabo (Japanese Version 3rd Anniversary Set) | OP07-118 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Sabo","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Roronoa Zoro (One Piece Day Dallas 2025) | OP07-113 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Roronoa Zoro","setCode":"OP07","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Sabo (Sealed Battle 2023 Vol. 1) | OP04-083 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Sabo","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Nami (Parallel) | ST21-009 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Nami","setCode":"ST21","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Brook (035) | OP10-035 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Brook","setCode":"OP10","collectorNumber":"OP10-020","promoStamp":true,"language":"en","firstEdition":false} |
| Sanji (Round 1 Promo) | OP15-047 | dim light | pick | {"isTradingCard":true,"game":"one piece","name":"Sanji","setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Sanji (Round 1 Promo) | OP15-047 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Sanji","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Usopp (Alternate Art) | EB02-022 | dim light | pick | {"isTradingCard":true,"game":"one piece","name":"Usopp","setCode":"ERC2","collectorNumber":"ERC2-022","promoStamp":false,"language":"en","firstEdition":false} |
| Sanji (Event Pack Vol. 2) | P-034 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Sanji","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Crocodile (Winner Pack Vol. 5) | ST03-003 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Crocodile","setCode":"ST10","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Portgas.D.Ace (001) (Alternate Art) | OP16-001 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Portgas.D.Ace","setCode":"OP01","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
