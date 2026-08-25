# fama-dalfama-lisbon-01

Non-authoritative explanation for a human reader. **`investigation.json` is
the authoritative record** — this file never overrides it, and the
validator never reads this file. See `docs/SOURCE_INVESTIGATION_POLICY.md`
for the governing policy.

## What was investigated

**Fama D'Alfama**, a fado house/restaurant at Rua do Terreiro do Trigo 80,
Alfama, Lisboa, Portugal. The task came in with a loose prior-research note
claiming this venue has "a rare fado venue with a genuine, published
day-by-day performer calendar." This investigation treated that note as a
lead only, and independently re-verified everything itself against freshly
retained evidence.

- Homepage: `https://famadalfama.pt`
- Candidate events page (given, and verified correct — no correction
  needed): `https://famadalfama.pt/agenda-de-fados-em-lisboa/`

## What was found

The candidate events page is a single, plain, server-rendered WordPress
(Elementor) HTML page. As of the fetch (2026-08-25), it contained the
**entire month of August 2026** as 31 sequential day-blocks — one per
calendar day — each pairing:

- a `DD/MM` date heading (e.g. `17/08`),
- a Portuguese weekday name (e.g. `Segunda-feira`),
- a short paragraph naming that night's performers (singer(s), Portuguese
  guitar player, viola de fado player).

The page states the month/year exactly once, in an `AGOSTO 2026` heading.
`evidence/offline-proof.mjs` mechanically recomputes, using real Gregorian
calendar arithmetic (never "today's date"), the actual weekday for every
one of the 31 dates and confirms all 31/31 match what the page itself
states — i.e. the source's own combined statements are internally
self-consistent, not merely plausible-looking. This is genuine, honest
grounds for treating the claimed "day-by-day performer calendar" as real,
not for taking the prior note's word for it.

The nightly fado start time (`20h30`, opens `19h00`) is stated once, as a
shared page-level/venue-level constant — not repeated inside each
day-block. No end time, no per-night price, and no per-night URL or stable
ID exist anywhere in the retained evidence; the whole month lives on one
shared URL with no JSON-LD Event data, no ICS link, and no recognisable
calendar plugin. `wp-json` (383 REST routes) and the site's RSS feed were
both checked and ruled out as alternative data paths (no event-shaped
route; zero RSS items).

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was used, and it was `SUFFICIENT` — the
entire calendar was already visible in the plain, unauthenticated HTTP
response body. No escalation to Level 2/3/4 was attempted or needed.

## Decision

**`READY_FOR_ACTIVATION`.** All of the mechanically-enforced activation
gates in `docs/SOURCE_INVESTIGATION_POLICY.md` are met: identity is
`PROVEN`, the acquisition class (`STATIC_HTML`) is a resolved/supported
class, one `data_paths` entry is `PUBLIC`/`CONFIRMED`, `title` and
`start_date` are both `PROVEN`, `source_record_id` is honestly
`NOT_PRESENT` with an explicit documented alternative identity strategy
(a composite `venue + calendar date` key, since the source guarantees at
most one entry per calendar day), a known collector family
(`STATIC_EVENT_LIST`) is recommended, a `DETERMINISTIC_DERIVATION`
evidence item exists, and no blocker is `CRITICAL` (three `MINOR`
blockers only — see `investigation.json`'s `collector_assessment.blockers`
for the full, honest list: no source-documented ID, an unverified
page-level time constant, and unverified month-to-month URL continuity
since only one monthly snapshot was observed).

This is a research conclusion only. Reaching `READY_FOR_ACTIVATION` here
does **not** edit `sources/*.json`, any `venues/*.json` registry, or any
other live registry — turning this into an active collector is a
separate, explicitly-authorised step outside this investigation's scope.

## Evidence

All evidence lives under `evidence/`:

- `body-home.html` / `headers-home.txt` — homepage (identity).
- `body-agenda.html` / `headers-agenda.txt` — the candidate agenda page
  (the 31 day-blocks).
- `body-wpjson.json` / `headers-wpjson.txt` — wp-json REST route listing
  (checked, no event-shaped route found).
- `body-feed.xml` / `headers-feed.txt` — RSS feed (checked, zero items).
- `offline-proof.mjs` — dependency-free, no-network Node script that
  re-parses the retained files above and mechanically re-derives every
  claim in `investigation.json`'s `field_assessment`.
- `offline-proof-output.txt` — captured stdout of running that script;
  cited in `investigation.json` as the `DETERMINISTIC_DERIVATION`
  evidence item.
- `validate-mine.mjs` — a local, one-off sanity check (not itself a
  governed evidence item) that imports `validateInvestigationV1_1` from
  `ingestion/source-investigation/contract.mjs` and confirms
  `investigation.json` passes with zero errors.
