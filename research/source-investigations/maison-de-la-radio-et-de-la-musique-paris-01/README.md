# maison-de-la-radio-et-de-la-musique-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01. Investigates Maison de
la Radio et de la Musique (Radio France's multi-hall concert/broadcast
complex, 116 avenue du Président Kennedy, 75016 Paris). Official site:
https://www.maisondelaradioetdelamusique.fr/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The site is Drupal 11. The
homepage itself carries no current listing, but its own `/agenda` page (a
plain, static, paginated Drupal View, `?page=0..8`, ~126 events across ~9
pages) exposes a rich, self-contained card per event: title, a
source-provided category (`Concert`/`Émission en public`/`Événement`/...),
a full date stated two ways on the same card (a `data-date` attribute plus
separate day/month/year divs), a weekday+time text, a combined venue+room
location string, and a stable numeric `?s={id}` query parameter on every
event's own permalink.

A genuine, honest data-quality finding: one sampled event's own detail page
carries TWO distinct JSON-LD blocks (a generic `Event` and a separate
`MusicEvent`), and they **disagree with each other** — the `MusicEvent`
block's own `startDate` states `14:00`, while the list card (corroborated
by the `Event` block's own text `startDate`) states `20:30`, the real
performance time. This is recorded as a `MAJOR` blocker with a clear
mitigation (use the list card, never the `MusicEvent` JSON-LD), not
silently resolved by guessing which is right.

## Decision

`READY_FOR_ACTIVATION`. `recommended_family: STATIC_EVENT_LIST`.
`PARIS_BESPOKE` — a new `ingestion/maison-de-la-radio-et-de-la-musique/`
module (card-regex extraction over the `/agenda` list page; the JSON-LD
per-event pages are deliberately NOT consumed, per the documented time
discrepancy). Offline-proved against retained fixtures in
`tests/maison-de-la-radio-et-de-la-musique.test.mjs`.
