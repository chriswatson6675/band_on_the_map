# berghain-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin venue-population trial (`BOTM-DIFFICULT-SOURCE-TRIAL-01`
methodology reused for Berlin). Investigates Berghain / Panorama Bar /
Säule / Halle / Kantine am Berghain, one of the world's most famous techno
clubs (Friedrichshain, Berlin).

## Summary

Berghain's official site (`https://www.berghain.berlin/`) turned out to be
genuinely cooperative for a club with an otherwise famously
anti-marketing/minimal public presence: its `/en/program/` page is fully
server-rendered plain HTML (no client-side shell, no JSON-LD, no known CMS
fingerprint) with one card per upcoming event — date, door/start time,
room, title, and lineup — each linking to a stable numeric permalink
(`/en/event/{id}/`). The event-detail page goes further, embedding a full
running order with genuine ISO 8601 UTC-offset datetimes in
`data-set-item-start`/`data-set-item-end` attributes and a price/ticket
section linking to the venue's own first-party ticketing subdomain
(`ticketingv2.berghain.de`). The separately-programmed Kantine am Berghain
room uses the identical template on its own sub-page.

Level 1 (`PASSIVE_STATIC`) alone was sufficient — no escalation was
needed. Classified `STATIC_HTML` / `STATIC_EVENT_LIST` (an existing
collector family, no new family required).

## What is NOT claimed

- No overall event *end* time is published anywhere on the site (only
  per-set start/end within the running order, and even the final set of
  the night carries no closing time) — recorded `NOT_PRESENT`, not
  guessed.
- No street address was retained as first-party evidence in this bounded
  investigation, so `venue_location` records only the room name the source
  itself states, not an address sourced from third parties.
- `price` is recorded `PARTIAL`: present on the one sampled event-detail
  page, but Berghain is well known for irregular/no-online-ticket nights,
  so a single sample was not generalised into a proven pattern.
- `source_record_id` stability rests on the site's own permalink scheme
  (a documented, evidenced basis under the policy's stable-identifier
  rule), not on an empirical repeated-fetch test — that was out of scope
  for this bounded investigation.

## Decision

`READY_FOR_OFFLINE_PROOF` — everything needed for activation is otherwise
in place (identity PROVEN, a resolved supported acquisition class, CONFIRMED
public data paths, `title`/`start_date` PROVEN with `basis: DIRECT_SOURCE`,
`source_record_id` PROVEN, an existing recommended family, no CRITICAL
blocker) except a `DETERMINISTIC_DERIVATION` evidence item — an offline,
no-network re-parse of the retained fixtures — which was not produced here.
Building and running that offline proof (and any collector wiring) is
separate follow-up work, per this task's own scope.
