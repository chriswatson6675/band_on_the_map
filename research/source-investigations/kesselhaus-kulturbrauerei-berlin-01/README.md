# kesselhaus-kulturbrauerei-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30-40 venue collector-reuse trial. Investigates
Kesselhaus / Kulturbrauerei (concert venue within the Kulturbrauerei
complex, Prenzlauer Berg, Berlin) as an event-source candidate.

## Summary

- Official first-party site: `https://www.kesselhaus.net/`.
- Platform: a custom Angular Universal (SSR) application backed by
  Firebase. The calendar list page embeds an Angular transfer-state JSON
  blob (using a custom `&q;` -> `"` escaping, mechanically reversible) that
  enumerates upcoming events with real UTC timestamps; each event's own
  detail page additionally carries a clean, standard schema.org JSON-LD
  `Event` block.
- Level 1 PASSIVE_STATIC was sufficient (both retained HTTP responses were
  read as plain text; no JS execution or browser was used).
- One real event (`Move iT! - the 90s party`, 1 Aug 2026, 22:00 CEST /
  `2026-08-01T20:00:00.000Z` UTC) was sampled at detail-page granularity,
  cross-confirmed against the calendar page's own transfer-state entry for
  the same event id.
- `title`, `start_date`, `time`, `venue_location`, `source_record_id`, and
  `event_url` are all `PROVEN` (`DIRECT_SOURCE`). `price` is `PARTIAL`
  (only present as unstructured free text on the detail page's ticket
  button — "VVK: 8 Euro plus Gebühren | AK: 12 Euro").
- Decision: `READY_FOR_OFFLINE_PROOF` — no offline
  parser/`DETERMINISTIC_DERIVATION` proof was produced in this
  investigation (out of scope per this task), so `READY_FOR_ACTIVATION`'s
  gate 9 cannot yet be satisfied. Recommended collector family: `JSON_LD`
  (this project's existing, generic, reusable module handles per-event
  extraction unmodified; a small new list-discovery step against the
  embedded transfer-state blob is the only genuinely new work, noted as a
  MINOR blocker).
