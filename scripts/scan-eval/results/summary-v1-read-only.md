# Card scanner accuracy, 2026-11-19

588 images of 98 Riftbound cards through claude-haiku-5-5 + our matcher (2 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 588 | 87.8% | 99.5% | 99.8% | 8.2% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| tilted on a table | 98 | 90.8% | 100.0% | 100.0% | 8.2% |
| foil sheen | 98 | 90.8% | 100.0% | 100.0% | 7.1% |
| dim light | 98 | 86.7% | 100.0% | 100.0% | 9.2% |
| far and small | 98 | 74.5% | 96.9% | 99.0% | 9.2% |
| clean | 98 | 93.9% | 100.0% | 100.0% | 5.1% |
| glare | 98 | 89.8% | 100.0% | 100.0% | 10.2% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 97.1% | 99.2% | 100.0% | 0.8% |
| alt art | 120 | 95.0% | 99.2% | 99.2% | 1.7% |
| overnumbered / signature | 72 | 83.3% | 100.0% | 100.0% | 4.2% |
| promo | 78 | 41.0% | 100.0% | 100.0% | 52.6% |
| battlefield | 48 | 97.9% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 100.0% | 100.0% | 100.0% | 0.0% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 554 | 94.2% | 91.3% |
| medium | 19 | 3.2% | 36.8% |
| low | 15 | 2.6% | 20.0% |

Latency (model call): median 1.38 s, 90th percentile 1.51 s. Cost of this whole run: US$0.133; per Haiku scan US$0.00023.

### Haiku 5.5 vs Sonnet 5.5 on the same hard images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| Haiku 5.5 | 120 | 95.8% | 98.3% | 100.0% | 0.8% |
| Sonnet 5.5 | 120 | 0.0% | 0.0% | 0.0% | 0.0% |

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| ogn-259-298 Yasuo, Unforgiven | clean | ogn-259-p | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":true,"language":"en"} |
| ogn-259-298 Yasuo, Unforgiven | glare | ogn-259-p | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":true,"language":"en"} |
| unl-177a-219 Ivern, Friend to All | far and small | unl-177-219 | {"isTradingCard":true,"game":"riftbound","name":"Ivern","setCode":"UNL","collectorNumber":"177/219","promoStamp":false,"language":"en"} |
| ogn-214a-298 Order Rune | dim light | ogn-214-298 | {"isTradingCard":true,"game":"riftbound","name":"Order Rune","setCode":"OGN","collectorNumber":"214/298","promoStamp":false,"language":"en"} |
| ogn-301-star-298 Jinx, Loose Cannon | glare | ogn-301-298 | {"isTradingCard":true,"game":"riftbound","name":"Jinx, Loose Cannon","setCode":"OGN","collectorNumber":"301/298","promoStamp":false,"language":"en"} |
| ogn-299-298 Kai'Sa, Daughter of the Void | glare | ogn-299-star-298 | {"isTradingCard":true,"game":"riftbound","name":"Daughter of the Void","setCode":"OGN","collectorNumber":"299*/298","promoStamp":false,"language":"en"} |
| ogn-299-298 Kai'Sa, Daughter of the Void | foil sheen | ogn-299-star-298 | {"isTradingCard":true,"game":"riftbound","name":"Daughter of the Void","setCode":"OGN","collectorNumber":"299*/298","promoStamp":false,"language":"en"} |
| tcg-684993 Rek'Sai, Void Burrower | clean | tcg-689191 | {"isTradingCard":true,"game":"riftbound","name":"Void Burrower","setCode":"SFD","collectorNumber":"187/221","promoStamp":true,"language":"en"} |
| tcg-684993 Rek'Sai, Void Burrower | tilted on a table | tcg-689191 | {"isTradingCard":true,"game":"riftbound","name":"Void Burrower","setCode":"SFD","collectorNumber":"187/221","promoStamp":true,"language":"en"} |
| tcg-684993 Rek'Sai, Void Burrower | glare | tcg-689191 | {"isTradingCard":true,"game":"riftbound","name":"Void Burrower","setCode":"SFD","collectorNumber":"187/221","promoStamp":true,"language":"en"} |
| tcg-684993 Rek'Sai, Void Burrower | dim light | tcg-689191 | {"isTradingCard":true,"game":"riftbound","name":"Void Burrower","setCode":"SFD","collectorNumber":"187/221","promoStamp":true,"language":"en"} |
| tcg-684993 Rek'Sai, Void Burrower | foil sheen | tcg-689191 | {"isTradingCard":true,"game":"riftbound","name":"Void Burrower","setCode":"SFD","collectorNumber":"187/221","promoStamp":true,"language":"en"} |
| tcg-684993 Rek'Sai, Void Burrower | far and small | sfd-187-221 | {"isTradingCard":true,"game":"riftbound","name":"Void Burrower","setCode":"SFD","collectorNumber":"187/221","promoStamp":false,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | clean | ogn-249-p | {"isTradingCard":true,"game":"riftbound","name":"Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":true,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | tilted on a table | ogn-249-298 | {"isTradingCard":true,"game":"riftbound","name":"Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":false,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | glare | ogn-249-298 | {"isTradingCard":true,"game":"riftbound","name":"Volibear, Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":false,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | dim light | ogn-249-298 | {"isTradingCard":true,"game":"riftbound","name":"Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":false,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | foil sheen | ogn-249-p | {"isTradingCard":true,"game":"riftbound","name":"Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":true,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | far and small | ogn-249-298 | {"isTradingCard":true,"game":"riftbound","name":"Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | clean | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | tilted on a table | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | glare | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Yasuo, Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | dim light | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | foil sheen | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Yasuo, Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| ogn-128-p Challenge | far and small | ogn-128-298 | {"isTradingCard":true,"game":"riftbound","name":"Challenge","setCode":"OGN","collectorNumber":"128/298","promoStamp":false,"language":"en"} |
