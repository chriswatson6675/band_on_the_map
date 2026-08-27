# Le Trianon (Paris) — source investigation

See `investigation.json` for the authoritative record. This file is
explanatory only.

## Summary

Le Trianon's official events archive lives at `/en/event/` (verified
directly for this investigation — a prior pass had only checked the
site's separate `/practical-information` history page, which carries no
event listing at all). It is a WordPress custom post-type archive
(`post-type-archive-evenement`, theme `vkd_tem` / child theme
`vkdchild_trianon`) whose full listing is fully static HTML: 35 repeated
`bloc_extrait evenement` cards (33 cleanly parsed by this investigation's
own bounded extraction), each stating its own WordPress post ID
(`data-id`), first-party detail-page URL, title, and — critically — a
**complete** `Weekday DD Month YYYY` date string (e.g. `"Sunday 30 August
2026"`) directly on the card itself. No month/year-heading inheritance
(the v1.2 `DETERMINISTIC_CONTEXT` mechanism) is needed here: every card
already states its own full date directly (`DIRECT_SOURCE`).

Time-of-day and price are not present on the list page; one sampled
detail page (EARTHEATER) confirms time IS available there (`"at
20h00"`), but price is not — ticket purchase redirects to the
third-party Hubber checkout domain (`trianon8-prod.mutu.hubber.fr`).

## Shared platform with Élysée Montmartre

Le Trianon and Élysée Montmartre are co-managed and share the exact same
WordPress theme/markup for their own events archives (confirmed live,
not merely assumed from being co-managed) — only the locale differs
(English here, French at Élysée Montmartre). Both are served by ONE
shared, reusable module, `ingestion/wp-evenement-cards/`, rather than two
near-duplicate bespoke collectors — see that investigation's own README
for the parallel finding.

## Decision

`READY_FOR_ACTIVATION`. `collector_assessment.recommended_family` is
`STATIC_EVENT_LIST` (an existing family). Offline proof in
`tests/le-trianon.test.mjs` against a real, byte-faithful excerpt fixture
(`fixtures/le-trianon-paris/events-page-sample.html`).
