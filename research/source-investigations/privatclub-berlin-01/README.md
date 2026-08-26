# privatclub-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue reuse trial. Privatclub's own homepage
(`privatclub-berlin.de`, WordPress) embeds 100 separate schema.org
`MusicEvent` JSON-LD blocks directly in server-rendered HTML — one per
upcoming event card, all in a single fetch. Same acquisition pattern as Moog
Barcelona / Lido Berlin / SO36 — `ingestion/json-ld/`, zero new collector
code. Each event's own German-language description text independently
restates its date/time in prose, corroborating the structured `startDate`.

`startDate` is floating-local (no UTC offset at all, e.g. `2026-09-01T20:00`)
— honestly recorded as such rather than assumed to be UTC. `price` stays
`PARTIAL`: the `offers` array gives only a ticket URL (varying third-party
sellers per event — greyzone-tickets.de, eventim.de), never a stated value.

Decision: `READY_FOR_OFFLINE_PROOF` — a real, bounded, retained sample (6 of
100 real events) exists and every gate-relevant field is honestly assessed,
but no collector code or `DETERMINISTIC_DERIVATION` offline-proof evidence
was produced in this investigation-only task.
