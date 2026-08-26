# silent-green-kulturquartier-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

## Summary

silent green Kulturquartier's official domain (`https://www.silent-green.net/en/`)
is a TYPO3 CMS site (`tx_news` extension) with a real, server-rendered
programme calendar at `/en/programme`. There is no JSON-LD Event schema, no
ICS/RSS feed, and no discoverable JSON API — but every event's own detail
page (`/en/programme/detail/{slug}`) server-renders the full facts in
clean, consistently-named CSS-classed spans (`event-detail-date-begin`,
`event-detail-date-end`, `event-detail-time-begin`, `event-detail-time-end`,
`event-detail-location`) plus an `<h1 itemprop="headline">` title and a
`rel="canonical"` stable URL.

Three real, independent event pages were sampled (a single-evening concert
with an external RA ticket link, a multi-day installation with an explicit
end date/time, and a free event with neither ticket link nor end date) —
confirming the markup is consistent and that `end`/`price` are honestly
sometimes-absent, not missing data.

## Decision

`READY_FOR_OFFLINE_PROOF`. This investigation task did not build or run
collector/test code, so no `DETERMINISTIC_DERIVATION` offline-proof evidence
item exists yet (activation gate 9) — that is separate follow-up work. All
other activation-relevant facts (identity, acquisition class, a confirmed
public data path, `title`/`start_date` both `PROVEN` with `basis:
DIRECT_SOURCE`, a documented `source_record_id` strategy) are already
solidly established. Recommended collector family: `STATIC_EVENT_LIST`
(existing family — a discover-from-list, fetch-detail-page pattern already
used elsewhere in this repository).

## Evidence

See `evidence/` — the homepage, the programme calendar list page, and 3
independent event detail pages, all retained byte-faithfully via `curl`.
