# yaam-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30/40 venue collector-reuse trial. YAAM's official site
(`yaam.de`) is WordPress running "The Events Calendar" (Modern Tribe)
plugin, with BOTH its REST API (`wp-json/tribe/events/v1/events`) and its
ICS export (`/events/?ical=1`) live and public — the two were cross-checked
against each other for the same event, and matched. This is a clean,
zero-new-code fit for this project's existing `ingestion/events-calendar-api/`
and `ingestion/ics/` collector families.

Only 1 event was published via either feed at investigation time (a family
brunch), despite YAAM's general reputation for a regular sound-system/
reggae/hip-hop/dancehall programme — noted honestly as a MINOR blocker
limiting how representative this one sample is, not glossed over.
`price` is honestly `PARTIAL` rather than `PROVEN`: the source's own
`cost_details` has a data-entry quirk (a price apparently merged into the
currency symbol field) that isn't cleanly machine-extractable from this
sample.

Level 1 (`PASSIVE_STATIC`) was sufficient. Recommended family:
`WORDPRESS_CALENDAR` (existing). No offline-proof evidence item was
produced in this investigation, so the decision is
`READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION`.
