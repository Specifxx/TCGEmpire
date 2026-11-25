# Card scanner accuracy, 2026-11-25

594 images of 97 Riftbound cards through claude-haiku-5-5 + our matcher (1 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 594 | 92.1% | 97.6% | 98.0% | 0.5% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| far and small | 99 | 86.9% | 94.9% | 96.0% | 0.0% |
| dim light | 99 | 90.9% | 97.0% | 98.0% | 1.0% |
| tilted on a table | 99 | 92.9% | 98.0% | 98.0% | 0.0% |
| foil sheen | 99 | 91.9% | 98.0% | 98.0% | 1.0% |
| glare | 99 | 94.9% | 99.0% | 99.0% | 0.0% |
| clean | 99 | 94.9% | 99.0% | 99.0% | 1.0% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 97.1% | 99.2% | 100.0% | 0.8% |
| alt art | 120 | 98.3% | 98.3% | 98.3% | 0.0% |
| overnumbered / signature | 72 | 86.1% | 94.4% | 94.4% | 1.4% |
| promo | 78 | 64.1% | 92.3% | 92.3% | 0.0% |
| battlefield | 54 | 100.0% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 100.0% | 100.0% | 100.0% | 0.0% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 463 | 77.9% | 99.4% |
| medium | 95 | 16.0% | 69.5% |
| low | 36 | 6.1% | 58.3% |

### Look-alike printings (second call comparing pictures)

| twin check | images | right printing |
|---|---:|---:|
| promo-twin | 96 | 67.7% |
| picked | 105 | 97.1% |
| none | 386 | 98.2% |
| unsure | 7 | 14.3% |

Latency (model calls, both steps): median 1.18 s, 90th percentile 2.59 s. Cost of this whole run: US$0.177; per Haiku scan US$0.00030.

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| spoiler-rad-181-yone-blademaster Yone, Blademaster | clean | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| spoiler-rad-181-yone-blademaster Yone, Blademaster | foil sheen | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| unl-226-star-219 Jhin, Virtuoso | dim light | unl-226-219 | {"isTradingCard":true,"game":"riftbound","name":"Virtuoso","setCode":"UNL","collectorNumber":"226/219","promoStamp":false,"language":"en"} |
