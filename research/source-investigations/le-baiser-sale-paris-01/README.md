# le-baiser-sale-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Investigates Le Baiser Salé (jazz club, 58 rue des Lombards, 75001 Paris).
Official site: https://www.lebaisersale.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. A plain curl GET of the
official `/fr/agenda` page server-renders 27 real, dated show cards (19
distinct dates, 2026-08-27 to 2026-09-17) directly as static HTML — no
JSON-LD, ICS, or JSON API anywhere. Real, server-rendered pagination
(`/fr/agenda/page-2` .. `page-9`) confirms further weeks are reachable the
same way.

Each show card states its own artist name and time directly, but the
**full date is never repeated on the card itself** — it is inherited
structurally from the nearest preceding "date-timeline" heading, which
does state the complete date (day/month/**year**) directly. This is a
genuine `DETERMINISTIC_CONTEXT` case per policy v1.2: the heading's own
value is combined with a real, provable structural-adjacency relationship
(not visual proximity), reproduced offline.

One honest wrinkle found: this source's own permalink slug is **not**
always 1:1 with a single real occurrence — at least one recurring series
(`#LaPetiteHeure by... Etienne Mbappé`) reuses the same slug across 3
consecutive calendar dates. `source_record_id` is therefore composed as
`{slug}#{date}`, both fields already independently evidenced, rather than
trusting the raw slug alone.

No price appears on the page itself; the "Réserver" button links to a
third-party ticketing domain (billetweb.fr), not treated as price
authority per policy.

## Collector built

`ingestion/le-baiser-sale/discovery.mjs` (date-heading/card structural
association + French date-heading parsing) + `observation-adapter.mjs`
(composite `source_record_id`, `FLOATING_LOCAL` time, no fabricated
venue/price). Fixture: `fixtures/le-baiser-sale-paris/agenda-raw.html`
(the full retained page). Offline test: `tests/le-baiser-sale.test.mjs`
(4/4 passing, `node:test`, zero network calls).

## Decision

`READY_FOR_ACTIVATION` — every gate in
`docs/SOURCE_INVESTIGATION_POLICY.md` (v1.2) is satisfied against retained
evidence, including the offline `DETERMINISTIC_DERIVATION` proof for the
two `DETERMINISTIC_CONTEXT`-basis gated fields (`start_date`;
`source_record_id`, itself built on `start_date`). This investigation
does **not** edit `sources/paris.json` or any registry — see the parent
task's final report for the proposed entry.
