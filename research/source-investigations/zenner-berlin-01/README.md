# zenner-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30/40 venue collector-reuse trial. Zenner (Ina & Robert
Zenner am Treptower Park) is historically a beer-garden/wine-garden venue,
so this investigation specifically checked whether it has a genuine,
regular music programme rather than assuming so — honest answer: yes. The
official site (`zenner.berlin`) is a Gatsby React SPA sourced from a
headless Sanity CMS. Its `/programm/` page's own Gatsby-generated
`page-data.json` (a well-known, statically-discoverable Gatsby build
convention, found without executing any JS) returns 115 real event nodes,
including 5 genuinely upcoming events (24 Sep – 5 Nov 2026) with real
artist/event titles, a full UTC-instant `eventDate`, room (`place`), and
an external ticketing link.

`start_date` is `PROVEN` with the highest-precision basis found across
this trial (a genuine UTC instant, not a floating local time).
`source_record_id` is honestly left `PARTIAL` rather than `PROVEN`: the
node's own `id` looks like a stable Gatsby/Sanity-derived id, but this
investigation did not independently query Sanity's raw API to empirically
confirm that mapping (unlike `razzmatazz-barcelona-01`, which did).

Level 1 (`PASSIVE_STATIC`) was sufficient. Recommended family:
`NEW_FAMILY_REQUIRED` (a Gatsby `page-data.json` pattern, structurally
distinct from Razzmatazz's live-GROQ Sanity pattern, but likely reusable
for other Gatsby+Sanity sites). No offline-proof evidence item was
produced in this investigation, so the decision is
`READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION`.
