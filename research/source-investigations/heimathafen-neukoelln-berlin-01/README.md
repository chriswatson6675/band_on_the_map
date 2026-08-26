# heimathafen-neukoelln-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30-40 venue collector-reuse trial. Investigates
Heimathafen Neukölln (theatre / concert / cultural venue, Neukölln,
Berlin) as an event-source candidate.

## Summary

- Official first-party site: `https://heimathafen-neukoelln.de/`.
- Platform: WordPress, with a custom `events` post type (not the Tribe
  "The Events Calendar" plugin this project usually tries first — that
  endpoint 404s here) exposed via the standard `wp/v2` REST API, enriched
  with Advanced Custom Fields (ACF) data.
- Level 1 PASSIVE_STATIC was sufficient; no escalation was needed.
- 5 real upcoming event records were retained from one request to
  `/wp-json/wp/v2/events?per_page=5`.
- `title`, `time`, `venue_location`, `source_record_id`, `event_url`, and
  `price` are all `PROVEN` (`DIRECT_SOURCE`) — price is a genuine
  structured ACF field here, unusual among this trial's other sources.
  `start_date` is `PROVEN` via `DETERMINISTIC_CONTEXT`: the field's own
  `performance_date_time` values are ambiguous slash-separated dates
  ("03/05/2027"), but three other sampled values in the same field/sample
  have a first number > 12 (e.g. "09/29/2026"), which is structurally
  impossible as a month — mechanically proving the field's own
  `MM/DD/YYYY` convention, not a plausibility guess.
- Decision: `READY_FOR_OFFLINE_PROOF` — no offline
  parser/`DETERMINISTIC_DERIVATION` proof was produced in this
  investigation (out of scope per this task), so `READY_FOR_ACTIVATION`'s
  gate 9 cannot yet be satisfied. Recommended collector family: `JSON_API`
  (existing, reusable family).
