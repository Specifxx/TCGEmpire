# Card scanner accuracy, 2026-11-26

594 images of 97 Riftbound cards through claude-haiku-5-5 + our matcher (1 cards skipped: image would not download). Errors: 0.

"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.

### All images

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| all | 594 | 91.8% | 97.8% | 98.1% | 0.8% |

### By photo condition

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| dim light | 99 | 90.9% | 97.0% | 98.0% | 1.0% |
| tilted on a table | 99 | 90.9% | 97.0% | 98.0% | 1.0% |
| far and small | 99 | 87.9% | 97.0% | 97.0% | 0.0% |
| glare | 99 | 94.9% | 99.0% | 99.0% | 0.0% |
| foil sheen | 99 | 90.9% | 98.0% | 98.0% | 2.0% |
| clean | 99 | 94.9% | 99.0% | 99.0% | 1.0% |

### By kind of card

| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |
|---|---:|---:|---:|---:|---:|
| base | 240 | 96.3% | 99.2% | 100.0% | 1.7% |
| alt art | 120 | 98.3% | 99.2% | 99.2% | 0.0% |
| overnumbered / signature | 72 | 86.1% | 94.4% | 94.4% | 1.4% |
| promo | 78 | 64.1% | 92.3% | 92.3% | 0.0% |
| battlefield | 54 | 100.0% | 100.0% | 100.0% | 0.0% |
| rune | 30 | 100.0% | 100.0% | 100.0% | 0.0% |

### When the page says…

| confidence | images | share of scans | right printing |
|---|---:|---:|---:|
| high | 464 | 78.1% | 98.9% |
| medium | 94 | 15.8% | 71.3% |
| low | 36 | 6.1% | 52.8% |

### Look-alike printings (second call comparing pictures)

| twin check | images | right printing |
|---|---:|---:|
| promo-twin | 95 | 67.4% |
| picked | 105 | 95.2% |
| none | 386 | 98.2% |
| unsure | 8 | 25.0% |

Latency (model calls, both steps): median 1.29 s, 90th percentile 2.26 s. Cost of this whole run: US$0.178; per Haiku scan US$0.00030.

### Wrong cards marked "Match" (up to 25)

| truth | condition | returned | read |
|---|---|---|---|
| spoiler-rad-181-yone-blademaster Yone, Blademaster | dim light | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| spoiler-rad-181-yone-blademaster Yone, Blademaster | tilted on a table | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| spoiler-rad-181-yone-blademaster Yone, Blademaster | foil sheen | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| spoiler-rad-181-yone-blademaster Yone, Blademaster | clean | spoiler-rad-181s-yone-blademaster | {"isTradingCard":true,"game":"riftbound","name":"Yone","setCode":"RAD","collectorNumber":"181/167","promoStamp":false,"language":"en"} |
| spoiler-rad-178-ksante-courageous K'Sante, Courageous | foil sheen | spoiler-rad-178s-ksante-courageous | {"isTradingCard":true,"game":"riftbound","name":"K'Sante","setCode":"RAD","collectorNumber":"178/167","promoStamp":false,"language":"en"} |
