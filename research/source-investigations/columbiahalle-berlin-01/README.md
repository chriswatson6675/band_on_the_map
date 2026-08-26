# columbiahalle-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 6-venue collector-reuse trial. Investigates Columbiahalle
(mid-large concert hall, Columbiadamm, Tempelhof/Kreuzberg border, Berlin).
Official site: https://columbiahalle.berlin/

## What was found

A Contao CMS site. Level 1 (`PASSIVE_STATIC`) was sufficient: the
`veranstaltungen.html` listing page statically renders 87 upcoming events,
grouped under month/year headings, with each row itself stating only
weekday+day-of-month — a genuine `DETERMINISTIC_CONTEXT` case for
`start_date` (month/year heading + row day, per policy v1.2).

Each event's own "Kalender-Eintrag" link resolves to a real per-event ICS
file (`Content-Type: text/calendar`, despite the `.html`-suffixed URL) with
a full UTC `DTSTART`/`DTEND`, `LOCATION`, `GEO`, and a `UID`. The same
event's ICS was re-fetched a second time and the `UID` (`9702@Columbiahalle`)
was confirmed identical both times, satisfying the policy's stable-identifier
rule empirically. Two different events' `DTEND`-`DTSTART` gaps (9h vs. 4h)
differ meaningfully, giving confidence `end` is a genuine source-maintained
field rather than a synthesized default (unlike the AEG-operated sibling
venues, which showed a suspicious fixed +2h everywhere).

## Decision

`READY_FOR_OFFLINE_PROOF` — every other `READY_FOR_ACTIVATION` gate is
satisfied, but (1) no `DETERMINISTIC_DERIVATION` offline-proof evidence
item exists yet for the `DETERMINISTIC_CONTEXT` `start_date` field, and
(2) only 2 of 87 listed events were individually ICS-sampled. Both are
separate follow-up work, out of scope for this investigation task.
