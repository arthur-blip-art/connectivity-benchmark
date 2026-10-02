# Connectivity Benchmark

A lead magnet prototype for Chift. A software vendor picks its category and up to three countries, and sees which
accounting software its competitors connect to and it does not. The full report costs an email; every report request
becomes an enriched, scored and routed lead.

It is the mirror of connect-compta: there, an accountant picks a production software and sees which tools connect to
it. Here, a vendor picks its vertical and sees how its accounting coverage compares, country by country.

Scope: nine verticals, the ten countries of Chift's State of European Accounting Tech 2026.

## Run it

```bash
npm install
npm run dev        # http://localhost:3210
npm test           # the scoring module
npm run validate   # every data file against its schema
npm run data       # rebuild data/*.json from collector/
```

No key is needed. `MOCK_MODE` is on unless set to `false`: Slack, CRM and email messages are stored and shown on
`/internal` instead of being sent.

## Pages

| Page | What it shows |
|---|---|
| `/` | Map, country panel, connection matrix, report form. `?domain=pleo.io&countries=DE,BE` opens on a vendor's row, `?category=pos` on a vertical. |
| `/report/<id>` | The six-block report of one lead. |
| `/internal` | What sales and marketing see: leads, score lines, route, messages. Would sit behind SSO. |

## Where the data comes from

| Data | Source | File |
|---|---|---|
| Software that matter per country, and their level | Chift, State of European Accounting Tech 2026: tools cited by respondents, in chart order | `collector/whitepaper.json` |
| Who connects to what, France | connect-compta, Chift's public directory (133 tools, 14 production software) | `collector/raw/connect-compta-annuaire.json` |
| Who connects to what, everywhere | Vendors' public integrations pages and help centres | `collector/raw/editors-*.json` |
| Confirmation | The accounting software's own marketplace or partner page | `collector/raw/marketplaces.json` |
| Official reform dates, vendor figures | Public pages | `collector/raw/market*.json` |
| Measured platform shares, France | connect-compta barometer: Peppol lookups crossed with SIRENE | `collector/build-measures.mjs` |
| Measured platform shares, Belgium | Our own sample, same method: random company numbers looked up on Peppol | `collector/peppol-be.mjs` |

`npm run data` merges these into `data/*.json` and writes `collector/review.csv`, one line per vendor and software,
for the human review. Corrections go in `collector/overrides.csv`, then the build runs again.

Rules the data follows:

- A connection has a source URL and a collection date, or it does not exist.
- "Not found publicly" is never shown as "not connected".
- Three levels of proof: confirmed on the software's marketplace, listed in connect-compta, declared by the vendor.
- Importance is a level (dominant, important, secondary) with its sources. No market share is shown.
- A vendor is compared with the vendors of its own category that are active in the country. Under three competitors, no gap is flagged.
- A site that refuses to be read is listed, not worked around.

The white paper PDF is not in the repository: it sits behind a form on chift.eu.

## Code map

| Folder | Role |
|---|---|
| `collector/` | Collection scripts, raw files, the white paper digest. Runs apart from the site. |
| `data/` | Reference JSON, validated by zod schemas on every build. |
| `src/scoring/` | Coverage, gaps, priority, confidence, cost, lead score, routing. Pure functions, tested. |
| `src/lib/` | Schemas, data loading, benchmark, lead pipeline, SQLite store, live page reader. |
| `src/adapters/` | Enrichment, Slack, CRM (HubSpot), email. One interface each, simulated by default. |
| `src/app/` | Pages and API routes (`api/lead`, `api/intent`, `api/correction`, `api/scan`). |

## Lead routing

1. Existing Chift customer: alert to the CSM. Checked before any score.
2. Competitor of Chift: report delivered, no sales routing.
3. Score 70 or more: Slack alert to the AE and CRM record, found by email and domain so nothing is duplicated.
4. Score 40 to 69: country nurture sequence.
5. Below 40: newsletter.

Score, out of 100: fit 40 (vendor with accounting integrations 25, 50 to 500 employees 15), gap 25, seniority 20,
intent 15. Thresholds live in `data/settings.json`.

## Look

Colours, radii and type follow chift.eu. The typeface is Aspekta, open source under the SIL Open Font License
(`src/fonts/`). No Chift logo is used: the header says what this is, a prototype.

## Before a public launch

- Human review of `collector/review.csv`.
- `api/scan` fetches a domain typed by a visitor: resolve it and refuse private addresses before exposing it.
- Rate limiting is per instance, in memory.
- `/internal` needs authentication.
- A live enrichment provider behind `src/adapters/enrichment.ts`.
- The page ships the whole dataset to the browser: split it by category.
