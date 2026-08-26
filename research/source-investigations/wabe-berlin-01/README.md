# wabe-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30/40 venue collector-reuse trial. WABE's official site
(`wabe-berlin.info`) is a Jimdo-built static site with no JSON-LD/ICS/API —
but its own monthly programme pages (e.g. `/sep-2026/`) contain a real,
structurally repeatable per-event grid with genuine upcoming events (date,
time, title, performer, location, price).

The page states its month/year exactly once, as a retained on-page heading
("SEPTEMBER 2026"), while each event row states only its weekday and day
number. This is a clean real-world match for the v1.2 policy's
`DETERMINISTIC_CONTEXT` provision (heading states month/year once, card
states day) — `start_date` is recorded `PROVEN` with `basis:
"DETERMINISTIC_CONTEXT"` and an explicit derivation citing both retained
inputs, rather than left `AMBIGUOUS`/`UNKNOWN`.

No stable per-event id or dedicated event URL exists on this source at
all (`source_record_id` and `event_url` are honestly `NOT_PRESENT`) — any
future collector would need an explicit alternative identity strategy
(e.g. a derived hash of venue+date+title). The venue is also currently
displaced to an interim address during renovation, which a future
collector/observation-adapter would need to resolve correctly rather than
assuming one fixed WABE building for every event.

Level 1 (`PASSIVE_STATIC`) was sufficient. Recommended family:
`STATIC_EVENT_LIST` (existing). No offline-proof evidence item was
produced in this investigation, so the decision is `READY_FOR_OFFLINE_PROOF`,
not `READY_FOR_ACTIVATION`.
