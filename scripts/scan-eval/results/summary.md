# Card scanner accuracy, 2026-11-19

588 images of 98 Riftbound cards through claude-haiku-5-5 + our matcher (2 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 588 | 89.3% | 99.5% | 100.0% | 0.5% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| far and small | 98 | 80.6% | 96.9% | 100.0% | 0.0% |
| tilted on a table | 98 | 90.8% | 100.0% | 100.0% | 0.0% |
| clean | 98 | 94.9% | 100.0% | 100.0% | 0.0% |
| dim light | 98 | 88.8% | 100.0% | 100.0% | 0.0% |
| foil sheen | 98 | 88.8% | 100.0% | 100.0% | 3.1% |
| glare | 98 | 91.8% | 100.0% | 100.0% | 0.0% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 97.1% | 99.2% | 100.0% | 0.4% |
| alt art | 120 | 99.2% | 99.2% | 100.0% | 0.0% |
| overnumbered / signature | 72 | 87.5% | 100.0% | 100.0% | 1.4% |
| promo | 78 | 43.6% | 100.0% | 100.0% | 0.0% |
| battlefield | 48 | 97.9% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 96.7% | 100.0% | 100.0% | 3.3% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 454 | 77.2% | 99.3% |
| medium | 121 | 20.6% | 57.0% |
| low | 13 | 2.2% | 38.5% |

### Look-alike printings (second call comparing pictures)

| twin check | images | right printing |
|---|---:|---:|
| promo-twin | 113 | 54.0% |
| picked | 98 | 98.0% |
| none | 373 | 98.1% |
| unsure | 4 | 50.0% |

Latency (model calls, both steps): median 1.31 s, 90th percentile 2.45 s. Cost of this whole run: US$0.175; per Haiku scan US$0.00030.

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| spoiler-rad-181-yone-blademaster Yone, Blademaster | foil sheen | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| ogn-299-298 Kai'Sa, Daughter of the Void | foil sheen | ogn-299-star-298 | {"isTradingCard":true,"game":"riftbound","name":"Daughter of the Void","setCode":"OGN","collectorNumber":"299*/298","promoStamp":false,"language":"en"} |
| tcg-678224 Fury Rune | foil sheen | tcg-662900 | {"isTradingCard":true,"game":"riftbound","name":"Fury Rune","setCode":"OGN","collectorNumber":"007/298","promoStamp":false,"language":"en"} |
