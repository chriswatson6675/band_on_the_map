# Élysée Montmartre (Paris) — source investigation

See `investigation.json` for the authoritative record. This file is
explanatory only.

## Summary

Élysée Montmartre's official events archive lives at `/fr/programmation/`
(verified directly for this investigation, and found to carry real, dated
2026 events on this page directly — consistent with a prior pass's
finding). It is the SAME WordPress theme (`vkd_tem`, child theme
`vkdchild_elysee`) confirmed live at co-managed Le Trianon
(`research/source-investigations/le-trianon-paris-01/`), here in its
French-locale variant: 54 repeated `bloc_extrait evenement` cards (49
cleanly parsed by this investigation's own bounded extraction), each
stating its own WordPress post ID, first-party detail-page URL, title,
and a complete `weekday DD month YYYY` date string (e.g. `"mardi 01
septembre 2026"`) directly on the card.

Time-of-day is confirmed present on one sampled detail page (CURRENT
JOYS: `"à 20h00"`) but not the list card; price is not present anywhere.
Ticket purchase redirects to a **first-party**
`billetterie.elyseemontmartre.com` checkout subdomain (unlike Le
Trianon's own third-party Hubber domain) — a real, minor platform
difference between the two co-managed venues that does not affect
acquisition.

## Shared platform with Le Trianon — genuinely reusable, not assumed

This task explicitly asked whether the shared "Hubber" ticketing platform
between Le Trianon and Élysée Montmartre was a reusable acquisition
pattern. The actual finding: the ticketing platform itself is NOT the
reusable acquisition surface (it differs between the two venues, and
neither venue's own event data lives there) — but the **WordPress theme
serving each venue's own events archive** genuinely is identical in
structure between both venues, confirmed live rather than assumed. One
shared module, `ingestion/wp-evenement-cards/` (`discovery.mjs` +
`observation-adapter.mjs`), serves both venues unchanged, with only a
per-venue `source_id`/`venueName` passed at call time. Its date parser
supports both this theme's English and French locale variants.

## Decision

`READY_FOR_ACTIVATION`. `collector_assessment.recommended_family` is
`STATIC_EVENT_LIST` (an existing family). Offline proof in
`tests/elysee-montmartre.test.mjs` against a real, byte-faithful excerpt
fixture (`fixtures/elysee-montmartre-paris/events-page-sample.html`),
using the SAME shared module Le Trianon's own test exercises.
