# TCG Singles DB card scanner: image coverage and accuracy, 2026-11-27

Model claude-haiku-5-5 (one read a photo) + TCG Singles DB's matcher. Pass: found >= 95% and wrong match <= 1%.

## pokemon: NOT YET

Image coverage: 98.7% of 700 sampled US$1+ cards and 97.7% of 300 sampled cards of any price have a real picture (placeholders 0, missing 16). 28273 of 28876 cards carry a printed number.

730 images of 146 cards (5 sampled cards had no picture). Errors 0. Median model time 1.46 s. Picker median 7 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 730 | 89.0% | 60.0% | 0.0% | 0.7% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| far and small | 146 | 70.5% | 32.9% | 0.0% | 0.7% |
| tilted on a table | 146 | 95.2% | 66.4% | 0.0% | 0.7% |
| glare | 146 | 93.2% | 67.1% | 0.0% | 0.7% |
| dim light | 146 | 91.8% | 65.1% | 0.0% | 0.7% |
| foil sheen | 146 | 94.5% | 68.5% | 0.0% | 0.7% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 97.1% | 88.5% | 0.0% | 0.0% |
| look-alike | 275 | 78.9% | 26.5% | 0.0% | 1.8% |
| any | 115 | 89.6% | 55.7% | 0.0% | 0.0% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| Pikachu | 61/90 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Pikachu","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Kabutops (14) | 014/144 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Kabutops","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Murkrow (58) | 58/90 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Murkrow","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Hypno (8) | 08/62 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Hypno","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Haunter (21) | 21/62 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Haunter","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Espeon (Prime) | 81/90 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Espeon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Rhydon (29) | 029/144 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Rhydon","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Houndour (54) | 54/90 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Houndour","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Unown (S) | S/28 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Unown","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Venusaur ex | 182/165 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Venusaur ex","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Eevee (84) | 84/108 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Eevee","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Erika (16) | 016/132 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Erika","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Jirachi - 2005 (Curran Hill) | 9/107 | dim light | pick | {"isTradingCard":true,"game":"pokemon","name":"Jirachi","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Jirachi - 2005 (Curran Hill) | 9/107 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Jirachi","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Skiploom - 2010 (Yuka Furusawa) | 65/132 | tilted on a table | pick | {"isTradingCard":true,"game":"pokemon","name":"Skiploom","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Skiploom - 2010 (Yuka Furusawa) | 65/132 | dim light | pick | {"isTradingCard":true,"game":"pokemon","name":"Skiploom","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Skiploom - 2010 (Yuka Furusawa) | 65/132 | glare | pick | {"isTradingCard":true,"game":"pokemon","name":"Skiploom","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Skiploom - 2010 (Yuka Furusawa) | 65/132 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Skiploom","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Clefairy | 63/108 | far and small | pick | {"isTradingCard":true,"game":"pokemon","name":"Clefairy","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Crobat (Cosmos Holo) | 056/149 | foil sheen | pick | {"isTradingCard":true,"game":"pokemon","name":"Crobat","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |

## yugioh: PASS

Image coverage: 97.9% of 700 sampled US$1+ cards and 99.3% of 300 sampled cards of any price have a real picture (placeholders 0, missing 17). 46685 of 46701 cards carry a printed number.

740 images of 148 cards (3 sampled cards had no picture). Errors 0. Median model time 1.49 s. Picker median 5 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 740 | 95.0% | 55.7% | 0.0% | 0.1% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| glare | 148 | 96.6% | 61.5% | 0.0% | 0.0% |
| foil sheen | 148 | 97.3% | 60.1% | 0.0% | 0.0% |
| dim light | 148 | 93.9% | 52.0% | 0.0% | 0.7% |
| tilted on a table | 148 | 96.6% | 60.1% | 0.0% | 0.0% |
| far and small | 148 | 90.5% | 44.6% | 0.0% | 0.0% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 98.2% | 66.5% | 0.0% | 0.0% |
| look-alike | 285 | 90.9% | 41.4% | 0.0% | 0.4% |
| any | 115 | 95.7% | 59.1% | 0.0% | 0.0% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| Exiled Force | HL04-EN001 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Exiled Force","setCode":"TDGS","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Megamorph | TP4-003 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Megamorph","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Nobleman of Crossout | HL06-EN001 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Nobleman of Crossout","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Nobleman of Crossout | HL06-EN001 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"Nobleman of Crossout","setCode":"DL06","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Limiter Removal | HL06-EN002 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Limiter Removal","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Limiter Removal | HL06-EN002 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"Limiter Removal","setCode":"LTGY","collectorNumber":"LTGY-EN002","promoStamp":false,"language":"en","firstEdition":false} |
| Jinzo - Lord | LODT-EN007 | tilted on a table | pick | {"isTradingCard":true,"game":"yugioh","name":"Jinzo - Lord","setCode":"LTGY","collectorNumber":"LTGY-EN007","promoStamp":false,"language":"en","firstEdition":true} |
| Jinzo - Lord | LODT-EN007 | foil sheen | pick | {"isTradingCard":true,"game":"yugioh","name":"Jinzo - Lord","setCode":"LTGY","collectorNumber":"LTGY-EN007","promoStamp":false,"language":"en","firstEdition":true} |
| Jinzo - Lord | LODT-EN007 | glare | pick | {"isTradingCard":true,"game":"yugioh","name":"Jinzo - Lord","setCode":"LTGY","collectorNumber":"EN007","promoStamp":false,"language":"en","firstEdition":true} |
| Jinzo - Lord | LODT-EN007 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"Jinzo - Lord","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Jinzo - Lord | LODT-EN007 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Jinzo - Lord","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Crush Card Virus (Version 2) | LCKC-EN046 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"Crush Card Virus","setCode":"TCAC","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Crush Card Virus (Version 2) | LCKC-EN046 | glare | pick | {"isTradingCard":true,"game":"yugioh","name":"Crush Card Virus","setCode":"LDS2","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Crush Card Virus (Version 2) | LCKC-EN046 | foil sheen | pick | {"isTradingCard":true,"game":"yugioh","name":"Crush Card Virus","setCode":"LCKC","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Crush Card Virus (Version 2) | LCKC-EN046 | tilted on a table | pick | {"isTradingCard":true,"game":"yugioh","name":"Crush Card Virus","setCode":"LDS2","collectorNumber":"LDS2-EN076","promoStamp":false,"language":"en","firstEdition":true} |
| Crush Card Virus (Version 2) | LCKC-EN046 | far and small | pick | {"isTradingCard":true,"game":"yugioh","name":"Crush Card Virus","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":true} |
| Ultimate Offering (Blue) | DL13-EN019 | tilted on a table | pick | {"isTradingCard":true,"game":"yugioh","name":"Ultimate Offering","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Ultimate Offering (Blue) | DL13-EN019 | glare | pick | {"isTradingCard":true,"game":"yugioh","name":"Ultimate Offering","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Ultimate Offering (Blue) | DL13-EN019 | dim light | pick | {"isTradingCard":true,"game":"yugioh","name":"Ultimate Offering","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Ultimate Offering (Blue) | DL13-EN019 | foil sheen | pick | {"isTradingCard":true,"game":"yugioh","name":"Ultimate Offering","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |

## one-piece: PASS

Image coverage: 98.0% of 700 sampled US$1+ cards and 98.3% of 300 sampled cards of any price have a real picture (placeholders 0, missing 19). 7278 of 7519 cards carry a printed number.

755 images of 151 cards (0 sampled cards had no picture). Errors 0. Median model time 1.47 s. Picker median 3 printings.

#### All

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| all | 755 | 97.0% | 58.8% | 0.0% | 0.5% |

#### By condition

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| glare | 151 | 99.3% | 62.9% | 0.0% | 0.7% |
| tilted on a table | 151 | 99.3% | 62.9% | 0.0% | 0.7% |
| dim light | 151 | 98.7% | 61.6% | 0.0% | 0.7% |
| far and small | 151 | 88.1% | 43.0% | 0.0% | 0.7% |
| foil sheen | 151 | 99.3% | 63.6% | 0.0% | 0.0% |

#### By kind of card

| | images | found (match or in picker) | right card first | wrong card as THE match | none |
|---|---:|---:|---:|---:|---:|
| US$1+ | 340 | 95.9% | 93.8% | 0.0% | 1.2% |
| look-alike | 300 | 98.0% | 16.7% | 0.0% | 0.0% |
| any | 115 | 97.4% | 65.2% | 0.0% | 0.0% |

#### Misses (up to 20)

| truth | number | condition | result | read |
|---|---|---|---|---|
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | glare | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | tilted on a table | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | dim light | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | far and small | none | {"isTradingCard":true,"game":"one piece","name":null,"setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Certificate of our crew) (Oversized) | 1/1000 | foil sheen | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey D. Luffy","setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Nico Robin (Event Pack Vol. 9) | P-116 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Nico Robin","setCode":"P","collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Yamato (001) | ST09-001 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Yamato","setCode":"ST09","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Nami - P-117 | P-117 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Nami","setCode":"P","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Pirates Party Vol. 3) | P-035 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Portgas.D.Ace (Premium Card Collection -Flame-Flame Fruit Coliseum Edition-) | P-153 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Portgas.D.Ace","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Garp (Sealed Battle Kit Vol. 1) | P-054 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Garp","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (001) | ST08-001 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":"ST09","collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Premium Card Collection -Flame-Flame Fruit Coliseum Edition-) | P-154 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Eustass"Captain"Kid (ST36-005) | ST36-005 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Eustass\"Captain\"Kid","setCode":"ST36","collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Pre-Release Tournament) (Winner) | P-036 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Monkey.D.Luffy (Round 1 Promo) | OP16-095 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Monkey.D.Luffy","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Enel (Sound Loader Vol. 2) | OP05-098 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Enel","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Trafalgar Law (Offline Regional 2023) [Finalist] | OP02-035 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Trafalgar Law","setCode":null,"collectorNumber":null,"promoStamp":true,"language":"en","firstEdition":false} |
| Portgas.D.Ace (Parallel) (Manga) (Alternate Art) | OP02-013 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Portgas.D.Ace","setCode":null,"collectorNumber":null,"promoStamp":false,"language":"en","firstEdition":false} |
| Mr.1 (Daz.Bonez) (Offline Regional 2024 Vol. 3) | OP02-063 | far and small | pick | {"isTradingCard":true,"game":"one piece","name":"Mr. 1 (Daz.Bonez)","setCode":null,"collectorNumber":"OP02-083","promoStamp":true,"language":"en","firstEdition":false} |
