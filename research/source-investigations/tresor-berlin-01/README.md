# tresor-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin venue-population trial (`BOTM-DIFFICULT-SOURCE-TRIAL-01`
methodology reused for Berlin). Investigates Tresor, a legendary Berlin
techno club (Mitte).

## Summary

Tresor's official site (`https://tresorberlin.com/`) is WordPress, but its
own `wp-json/tribe/events/v1/events` REST endpoint returns `401
rest_disabled` — confirmed by a direct request, not assumed. The site's
`/club/events/` page is nonetheless a fully server-rendered plain-HTML grid
of upcoming events, each linking to a permalink whose slug embeds the full
date directly (`/event/{YYYYMMDD}-{slug}/`). Each event-detail page states
a per-floor running order with door/start times as plain text.

Level 1 (`PASSIVE_STATIC`) alone was sufficient. Classified `STATIC_HTML` /
`STATIC_EVENT_LIST` (an existing collector family).

## What is NOT claimed

- No price is stated anywhere on the site itself — every sampled event's
  "Ticket Policy" section only links out to Resident Advisor (a third-party
  ticketing outlet), so `price` is recorded `NOT_PRESENT`, not guessed from
  RA.
- No overall event *end* time is published — the sampled Klubnacht's last
  set is explicitly open-ended ("07:00 – End").
- The room-name field (`floor-name`) is not perfectly uniform: a standard
  Klubnacht uses clean canonical names ("Tresor", "Globus"), but at least
  one sampled special/co-branded event embeds extra host/time text into
  the same field instead. This is recorded honestly as a MINOR blocker
  needing a normalisation rule, not silently generalised.
- No timezone offset is present anywhere in the source (unlike Berghain's
  ISO+offset) — times are recorded as floating local Europe/Berlin, not
  upgraded to UTC.

## Decision

`READY_FOR_OFFLINE_PROOF` — identity PROVEN, a resolved supported
acquisition class, CONFIRMED public data paths, `title`/`start_date`
PROVEN with `basis: DIRECT_SOURCE`, `source_record_id` PROVEN, an existing
recommended family, no CRITICAL blocker — but no `DETERMINISTIC_DERIVATION`
evidence item (an offline, no-network re-parse of the retained fixtures)
was produced here. That step, and any collector wiring, is separate
follow-up work per this task's own scope.
