# Literature frequency snapshot

`fetch-trend.py` requests Europe PMC REST count snapshots for 2010–2025.
Numerator: SRC:MED records with six specified English umbrella phrases in TITLE_ABS (OR union, one record counted once). Denominator: all SRC:MED records of each PUB_YEAR. No publication-type or abstract-availability filter. Synonym expansion disabled. This is not a Chinese/foreign comparison, social awareness measure, word-token frequency, or exhaustive emerging-pollutant corpus.

Refresh with Python 3: `python3 scripts/research/fetch-trend.py`.
It writes the normalized dataset, CSV, and raw responses to `public/research/` only after all requests succeed. Source URLs and timestamps are retained. Historical indexing changes mean reruns can differ.

`plot-trend.py` renders the saved snapshot using matplotlib, never interpolating annual values. Requires matplotlib and a Chinese-capable font; set RESEARCH_CHINESE_FONT to its path on non-macOS hosts. It writes PNG and SVG beside the data. The current images were generated with matplotlib in a temporary Python dependency directory.

Run `node --test tests/research-trend.test.mjs` to reconcile plotted numbers to saved responses and check denominators/calculation/query consistency.

Before updating years or query scope, update accompanying UI method text and chart footnotes. Recheck any prose interpretations when regenerating the dataset. Do not silently add incomplete 2026 data, fabricate Chinese database counts, or infer causality from policy-event timing.
