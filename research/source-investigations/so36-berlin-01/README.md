# so36-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue reuse trial. SO36's own ticket shop
(`so36.com/tickets`, built on a first-party white-label platform called
"tickettoaster") is server-rendered: a hidden SEO fallback nav list gives
title + date + a numeric product id for each upcoming show, and each
individual product page embeds a full, well-formed schema.org `Event`
JSON-LD block — including a *correctly* offset `startDate` (`+02:00`, unlike
a comparable field observed at Lido Berlin in this same trial), `endDate`,
full venue address, and multiple priced ticket offers. Same acquisition
pattern as Moog Barcelona / Lido Berlin — `ingestion/json-ld/`, zero new
collector code.

This was the richest single-page sample of the six venues in this trial:
every gate-relevant field (title, start_date, end, venue_location,
source_record_id, event_url, price) reached `PROVEN` from one retained page.

Decision: `READY_FOR_OFFLINE_PROOF` — a real, bounded, retained sample
exists and every field is honestly assessed, but no collector code or
`DETERMINISTIC_DERIVATION` offline-proof evidence was produced in this
investigation-only task.
