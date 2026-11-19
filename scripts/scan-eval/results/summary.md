# Card scanner accuracy, 2026-11-19

588 images of 98 Riftbound cards through claude-haiku-5-5 + our matcher (2 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 588 | 90.0% | 99.8% | 100.0% | 0.5% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| tilted on a table | 98 | 91.8% | 100.0% | 100.0% | 0.0% |
| glare | 98 | 91.8% | 100.0% | 100.0% | 0.0% |
| far and small | 98 | 82.7% | 99.0% | 100.0% | 0.0% |
| clean | 98 | 94.9% | 100.0% | 100.0% | 0.0% |
| dim light | 98 | 89.8% | 100.0% | 100.0% | 0.0% |
| foil sheen | 98 | 88.8% | 100.0% | 100.0% | 3.1% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 97.1% | 99.6% | 100.0% | 0.4% |
| alt art | 120 | 100.0% | 100.0% | 100.0% | 0.0% |
| overnumbered / signature | 72 | 91.7% | 100.0% | 100.0% | 1.4% |
| promo | 78 | 43.6% | 100.0% | 100.0% | 0.0% |
| battlefield | 48 | 97.9% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 96.7% | 100.0% | 100.0% | 3.3% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 461 | 78.4% | 99.3% |
| medium | 119 | 20.2% | 57.1% |
| low | 8 | 1.4% | 37.5% |

### Look-alike printings (second call comparing pictures)

| twin check | images | right printing |
|---|---:|---:|
| promo-twin | 113 | 54.0% |
| picked | 98 | 98.0% |
| none | 376 | 98.7% |
| failed | 1 | 100.0% |

Latency (model calls, both steps): median 1.28 s, 90th percentile 2.22 s. Cost of this whole run: US$0.174; per Haiku scan US$0.00030.

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| spoiler-rad-181-yone-blademaster Yone, Blademaster | foil sheen | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| ogn-299-298 Kai'Sa, Daughter of the Void | foil sheen | ogn-299-star-298 | {"isTradingCard":true,"game":"riftbound","name":"Daughter of the Void","setCode":"OGN","collectorNumber":"299*/298","promoStamp":false,"language":"en"} |
| tcg-678224 Fury Rune | foil sheen | tcg-662900 | {"isTradingCard":true,"game":"riftbound","name":"Fury Rune","setCode":"OGN","collectorNumber":"007/298","promoStamp":false,"language":"en"} |
