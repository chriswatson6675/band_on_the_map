# kater-blau-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin venue-population trial (`BOTM-DIFFICULT-SOURCE-TRIAL-01`
methodology reused for Berlin). Investigates Kater Blau, part of the
Holzmarkt 25 artists' collective, Mitte, Berlin.

## Note: the venue has rebranded

`katerblau.de` now issues a live HTTP 301 redirect to `www.katerclub.de`,
whose own `<title>` reads "Kater – Nights, Lights & Bubblegum". This is
recorded honestly as the same venue operating under a shortened brand name
("Kater"), not silently assumed — the retained JSON-LD (`"name": "Kater"`)
and footer copyright both corroborate this from the source's own content.

## Summary

Kater's homepage embeds its entire programme directly as server-rendered
WordPress "event" custom-post-type articles — each with the underlying
WordPress post ID exposed directly in its own HTML `id` attribute (e.g.
`id="event-1777"`), a day/month date, a full start–end date+time range as
text, title, and lineup.

This is the one investigation among the three "PARTIAL start_date" Berlin
cases with a genuinely first-party stable identifier (WordPress's own post
ID), unlike Wilde Renate which has no per-event identifier at all.

## What is NOT claimed

- No year is stated anywhere near the Program section — same limitation as
  `wilde-renate-berlin-01`. `start_date`/`end` are recorded `PARTIAL`
  (day/month/time proven) rather than guessed from today's date.
- No per-event URL exists on the venue's own domain — only an outbound
  Resident Advisor link for ticketed nights.
- No price figure is stated anywhere (RA-ticketed or explicitly free).

## Decision

`READY_FOR_OFFLINE_PROOF` — identity PROVEN (rebrand noted honestly),
acquisition_class STATIC_HTML resolved, a CONFIRMED public data path,
`title` PROVEN, `source_record_id` PROVEN via WordPress's own post-ID
scheme. The year-ambiguity is a genuine open design question, not merely a
missing offline-proof formality, so activation is not yet appropriate.
