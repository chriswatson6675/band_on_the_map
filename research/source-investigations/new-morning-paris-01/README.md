# new-morning-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Investigates New Morning (jazz club, 7-9 rue des Petites Écuries, 75010
Paris). Official site: https://www.newmorning.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient, in the best-case way this
project has already seen for other venues (Tempodrom Berlin, Privatclub
Berlin): the homepage itself embeds a 72-record schema.org JSON-LD
`Event` array — name, startDate/endDate, full postal-address `location`
with first-party stated `geo` coordinates, `offers` (a real single EUR
price), and its own permalink URL — no per-event crawling needed.

One genuine site bug found and documented honestly, not concealed: the
raw JSON-LD array **does not parse as-is**. Two independent, reproducible
defects: (1) at least one missing comma between adjacent object properties
in some records; (2) literal, unescaped control characters (raw newlines)
inside string values. Neither matches the one-line fix that solved
Tempodrom Berlin's unquoted `<script type=application/ld+json>` attribute
— this is a real (if still small and generic) JSON-repair requirement, not
covered by this project's existing collector code today.

Also found: every sampled `startDate`/`endDate` pair is a same-calendar-day
`T00:00:00`/`T23:30:00` sentinel, not a genuine performance time — `time`
and `end` are both honestly recorded `NOT_PRESENT` rather than promoted,
matching the same judgement this project already made for Tempodrom
Berlin's own `endDate`.

## Offline proof, not a production fix

`evidence/offline-proof.mjs` is a bounded, disclosed, no-network proof
script: it confirms the raw fixture genuinely fails `JSON.parse`, applies
a small generic repair (control-character escaping, then missing-comma
insertion), and reuses this project's **existing, unmodified**
`ingestion/json-ld/parse.mjs` `normaliseJsonLdEvent()` to reproduce every
claimed field exactly. This script must never become (or be copy-pasted
into) a production collector — see its own header comment. Per this
investigation's `PARIS_EXISTING_FAMILY_WITH_SMALL_FIX`-adjacent
classification, the actual repair was deliberately NOT added to the
shared `ingestion/json-ld/` module by this investigation — see the parent
task's final report for the exact change a future build phase would need.

## Decision

`READY_FOR_ACTIVATION` — title/start_date/venue_location/price all
`PROVEN` with `basis: DIRECT_SOURCE` (the malformed JSON is an acquisition
*reliability* concern, not a fact-*derivation* concern — the values
themselves are directly stated, not inferred). The one `MAJOR`
`collector_assessment.blockers` entry (the repair requirement) is
documented honestly rather than downgraded, and does not block activation
under policy (only `CRITICAL` blockers do).
