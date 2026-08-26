# waldbuehne-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30-40 venue collector-reuse trial. Investigates
Waldbühne Berlin (outdoor amphitheatre, Westend/Olympiapark, Berlin) as an
event-source candidate.

## Summary

- Official first-party site: `https://www.waldbuehne-berlin.de/`.
- Platform: the venue's own 'programm-und-tickets' page (and homepage)
  embed a single schema.org JSON-LD array of `MusicEvent` objects — the
  same pattern as `moog-barcelona-01`.
- Level 1 PASSIVE_STATIC was sufficient; no escalation was needed.
- 11 real, upcoming `MusicEvent` records were retained in full from one
  request, with `startDate`, `endDate`, `doorTime`, venue location/address,
  performer, and an `AggregateOffer` (price, when not sold out).
- `title`, `start_date`, `time`, `venue_location`, `source_record_id`, and
  `event_url` are all `PROVEN` (`DIRECT_SOURCE`). `end` and `price` are
  honestly `PARTIAL` (`end` reads as a same-day marker rather than a real
  end time; `price` is genuinely absent on sold-out records).
- Decision: `READY_FOR_OFFLINE_PROOF` — no offline
  parser/`DETERMINISTIC_DERIVATION` proof was produced in this
  investigation (out of scope per this task), so `READY_FOR_ACTIVATION`'s
  gate 9 cannot yet be satisfied. Recommended collector family: `JSON_LD`
  (this project's existing, generic, reusable module — zero new code).
