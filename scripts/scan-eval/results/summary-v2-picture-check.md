# Card scanner accuracy, 2026-11-19

588 images of 98 Riftbound cards through claude-haiku-5-5 + our matcher (2 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 588 | 89.1% | 99.5% | 99.8% | 3.6% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| glare | 98 | 91.8% | 100.0% | 100.0% | 5.1% |
| clean | 98 | 92.9% | 100.0% | 100.0% | 4.1% |
| tilted on a table | 98 | 89.8% | 100.0% | 100.0% | 4.1% |
| dim light | 98 | 88.8% | 100.0% | 100.0% | 2.0% |
| foil sheen | 98 | 88.8% | 100.0% | 100.0% | 5.1% |
| far and small | 98 | 82.7% | 96.9% | 99.0% | 1.0% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 97.9% | 99.2% | 100.0% | 0.8% |
| alt art | 120 | 99.2% | 99.2% | 99.2% | 0.0% |
| overnumbered / signature | 72 | 83.3% | 100.0% | 100.0% | 5.6% |
| promo | 78 | 44.9% | 100.0% | 100.0% | 16.7% |
| battlefield | 48 | 97.9% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 93.3% | 100.0% | 100.0% | 6.7% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 504 | 85.7% | 95.8% |
| medium | 73 | 12.4% | 50.7% |
| low | 11 | 1.9% | 36.4% |

### Look-alike printings (second call comparing pictures)

| twin check | images | right printing |
|---|---:|---:|
| picked | 309 | 93.2% |
| none | 212 | 98.6% |
| unsure | 67 | 40.3% |

Latency (model calls, both steps): median 2.46 s, 90th percentile 2.81 s. Cost of this whole run: US$1.098; per Haiku scan US$0.00046.

### Haiku 5.5 vs Sonnet 5.5 on the same hard images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| Haiku 5.5 | 120 | 96.7% | 98.3% | 100.0% | 0.8% |
| Sonnet 5.5 | 120 | 99.2% | 100.0% | 100.0% | 0.0% |

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| ogs-017-024 Annie, Dark Child - Starter | dim light | tcg-669265 | {"isTradingCard":true,"game":"riftbound","name":"Dark Child","setCode":"OGS","collectorNumber":"017/024","promoStamp":false,"language":"en"} |
| spoiler-rad-181-yone-blademaster Yone, Blademaster | foil sheen | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| ogn-303-star-298 Ahri, Nine-Tailed Fox | clean | ogn-303-298 | {"isTradingCard":true,"game":"riftbound","name":"Nine-Tailed Fox","setCode":"OGN","collectorNumber":"303*/298","promoStamp":false,"language":"en"} |
| ogn-303-star-298 Ahri, Nine-Tailed Fox | tilted on a table | ogn-303-298 | {"isTradingCard":true,"game":"riftbound","name":"Nine-Tailed Fox","setCode":"OGN","collectorNumber":"303*/298","promoStamp":false,"language":"en"} |
| ogn-303-star-298 Ahri, Nine-Tailed Fox | foil sheen | ogn-303-298 | {"isTradingCard":true,"game":"riftbound","name":"Nine-Tailed Fox","setCode":"OGN","collectorNumber":"303*/298","promoStamp":false,"language":"en"} |
| ogn-303-star-298 Ahri, Nine-Tailed Fox | glare | ogn-303-298 | {"isTradingCard":true,"game":"riftbound","name":"Nine-Tailed Fox","setCode":"OGN","collectorNumber":"303*/298","promoStamp":false,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | glare | ogn-249-298 | {"isTradingCard":true,"game":"riftbound","name":"Volibear, Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":false,"language":"en"} |
| tcg-669251 Volibear, Relentless Storm | tilted on a table | ogn-249-298 | {"isTradingCard":true,"game":"riftbound","name":"Relentless Storm","setCode":"OGN","collectorNumber":"249/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | glare | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Yasuo, Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | clean | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | dim light | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Yasuo, Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | tilted on a table | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| tcg-689172 Yasuo, Unforgiven | foil sheen | ogn-259-298 | {"isTradingCard":true,"game":"riftbound","name":"Unforgiven","setCode":"OGN","collectorNumber":"259/298","promoStamp":false,"language":"en"} |
| ogn-218-p Vanguard Captain | tilted on a table | ogn-218-298 | {"isTradingCard":true,"game":"riftbound","name":"Vanguard Captain","setCode":"OGN","collectorNumber":"218/298","promoStamp":false,"language":"en"} |
| ogn-024-p Void Seeker | glare | ogn-024-298 | {"isTradingCard":true,"game":"riftbound","name":"Void Seeker","setCode":"OGN","collectorNumber":"024/298","promoStamp":false,"language":"en"} |
| ogn-055-p Wielder of Water | clean | ogn-055-298 | {"isTradingCard":true,"game":"riftbound","name":"Wielder of Water","setCode":"OGN","collectorNumber":"055/298","promoStamp":true,"language":"en"} |
| ogn-055-p Wielder of Water | glare | ogn-055-298 | {"isTradingCard":true,"game":"riftbound","name":"Wielder of Water","setCode":"OGN","collectorNumber":"055/298","promoStamp":true,"language":"en"} |
| ogn-055-p Wielder of Water | far and small | ogn-055-298 | {"isTradingCard":true,"game":"riftbound","name":"Wielder of Water","setCode":"OGN","collectorNumber":"055/298","promoStamp":false,"language":"en"} |
| tcg-669250 Kai'Sa, Daughter of the Void | clean | ogn-247-298 | {"isTradingCard":true,"game":"riftbound","name":"Daughter of the Void","setCode":"OGN","collectorNumber":"247/298","promoStamp":true,"language":"en"} |
| tcg-678224 Fury Rune | foil sheen | tcg-662900 | {"isTradingCard":true,"game":"riftbound","name":"Fury Rune","setCode":"OGN","collectorNumber":"007/298","promoStamp":false,"language":"en"} |
| ogn-007-298 Fury Rune | foil sheen | tcg-662900 | {"isTradingCard":true,"game":"riftbound","name":"Fury Rune","setCode":"OGN","collectorNumber":"007/298","promoStamp":false,"language":"en"} |
