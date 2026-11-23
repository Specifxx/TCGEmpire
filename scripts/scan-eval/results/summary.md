# Card scanner accuracy, 2026-11-23

600 images of 99 Riftbound cards through claude-haiku-5-5 + our matcher (0 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 600 | 91.3% | 97.7% | 98.0% | 0.5% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| glare | 100 | 93.0% | 99.0% | 99.0% | 1.0% |
| clean | 100 | 94.0% | 99.0% | 99.0% | 1.0% |
| far and small | 100 | 84.0% | 93.0% | 95.0% | 0.0% |
| foil sheen | 100 | 94.0% | 99.0% | 99.0% | 0.0% |
| dim light | 100 | 91.0% | 98.0% | 98.0% | 0.0% |
| tilted on a table | 100 | 92.0% | 98.0% | 98.0% | 1.0% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 97.1% | 99.6% | 100.0% | 1.3% |
| alt art | 120 | 99.2% | 99.2% | 99.2% | 0.0% |
| overnumbered / signature | 72 | 88.9% | 94.4% | 95.8% | 0.0% |
| promo | 78 | 61.5% | 89.7% | 89.7% | 0.0% |
| battlefield | 60 | 90.0% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 100.0% | 100.0% | 100.0% | 0.0% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 477 | 79.5% | 99.4% |
| medium | 88 | 14.7% | 64.8% |
| low | 33 | 5.5% | 51.5% |
| none | 2 | 0.3% | 0.0% |

### Look-alike printings (second call comparing pictures)

| twin check | images | right printing |
|---|---:|---:|
| promo-twin | 77 | 61.0% |
| picked | 101 | 97.0% |
| none | 415 | 96.9% |
| unsure | 7 | 14.3% |

Latency (model calls, both steps): median 1.67 s, 90th percentile 3.57 s. Cost of this whole run: US$0.175; per Haiku scan US$0.00029.

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| spoiler-rad-181-yone-blademaster Yone, Blademaster | clean | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| spoiler-rad-181-yone-blademaster Yone, Blademaster | tilted on a table | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| spoiler-rad-181-yone-blademaster Yone, Blademaster | glare | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
