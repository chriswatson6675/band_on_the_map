# radialsystem-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

## Summary

Radialsystem's official domain (`https://www.radialsystem.de/en/`) has no
CMS fingerprint or JSON-LD, but its calendar (`/en/programm/programm/`) and
individual event pages (`/en/veranstaltungen/{slug}/`) are fully
server-rendered. Alpine.js only handles UI show/hide filtering — the actual
event data (title, one-or-more `dateblock` spans with weekday/day/month/year/
time, room, category, ticket link, price tiers) is already present in the
raw HTML.

One real production ("Zweiland" by Sasha Waltz & Guests) was sampled in
full: it has 6 separate performance dateblocks on its own detail page, each
with its own embedded `pretix.eu` ticket link (the venue's own first-party
ticketing) and tiered pricing text.

## Notable finding: one slug, many performances

A single production/slug (e.g. `zweiland`) legitimately maps to *multiple*
performance dates — a real one-to-many relationship, not an ambiguity. This
means `source_record_id` cannot honestly be `PROVEN` from the slug alone;
it is left `PARTIAL` with a documented, not-yet-empirically-verified
compound-key strategy (`slug` + the occurrence's own dateblock) for a future
collector to verify.

## Decision

`READY_FOR_OFFLINE_PROOF`. `title`, `start_date`, `time`, `venue_location`,
`event_url`, and `price` are all `PROVEN` with `basis: DIRECT_SOURCE`. No
offline parser reproduction was built in this investigation task (out of
scope), so activation gate 9 is not yet met. Recommended collector family:
`STATIC_EVENT_LIST`.

## Evidence

See `evidence/` — the homepage, the calendar list page, the Zweiland event
detail page, and the service/address page, all retained byte-faithfully via
`curl`.
