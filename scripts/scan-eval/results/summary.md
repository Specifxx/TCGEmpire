# Card scanner accuracy, 2026-11-25

594 images of 97 Riftbound cards through claude-haiku-5-5 + our matcher (1 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 594 | 92.4% | 97.6% | 98.0% | 0.3% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| glare | 99 | 94.9% | 99.0% | 99.0% | 0.0% |
| clean | 99 | 96.0% | 99.0% | 99.0% | 0.0% |
| tilted on a table | 99 | 92.9% | 98.0% | 98.0% | 0.0% |
| far and small | 99 | 87.9% | 94.9% | 96.0% | 0.0% |
| foil sheen | 99 | 91.9% | 98.0% | 98.0% | 1.0% |
| dim light | 99 | 90.9% | 97.0% | 98.0% | 1.0% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 97.5% | 99.2% | 100.0% | 0.4% |
| alt art | 120 | 99.2% | 99.2% | 99.2% | 0.0% |
| overnumbered / signature | 72 | 86.1% | 94.4% | 94.4% | 1.4% |
| promo | 78 | 64.1% | 91.0% | 91.0% | 0.0% |
| battlefield | 54 | 100.0% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 100.0% | 100.0% | 100.0% | 0.0% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 462 | 77.8% | 99.6% |
| medium | 97 | 16.3% | 72.2% |
| low | 35 | 5.9% | 54.3% |

### Look-alike printings (second call comparing pictures)

| twin check | images | right printing |
|---|---:|---:|
| promo-twin | 96 | 68.8% |
| picked | 103 | 98.1% |
| none | 387 | 97.9% |
| unsure | 8 | 37.5% |

Latency (model calls, both steps): median 1.13 s, 90th percentile 2.50 s. Cost of this whole run: US$0.177; per Haiku scan US$0.00030.

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| spoiler-rad-181-yone-blademaster Yone, Blademaster | foil sheen | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| unl-226-star-219 Jhin, Virtuoso | dim light | unl-226-219 | {"isTradingCard":true,"game":"riftbound","name":"Virtuoso","setCode":"UNL","collectorNumber":"226/219","promoStamp":false,"language":"en"} |
