# rex-club-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Rex
Club (electronic music club), 5 Boulevard Poissonnière, 75002 Paris.
Official site: https://rexclub.com/

## What was found

Level 1 (`PASSIVE_STATIC`) on the venue's own "Billetterie" page (the
site's "Programmation" menu item links to this same URL — there is no
separate programme page) found only a Contact Form 7 form and a
client-rendered `<iframe>` placeholder pointing at a third-party
ticketing platform, Shotgun.live. No dated events, JSON-LD, ICS, or
calendar markup of any kind exists on the venue's own domain.

Level 2 (`STRUCTURAL`) enumerated the site's own WordPress REST API: no
calendar/events plugin namespace, and no `event`/`tribe_events` post type
— only a `resident` custom post type, confirmed (by sampling it directly)
to hold DJ-residency bios, not dated events.

This task's brief specifically asked whether Shotgun.live itself might
expose a stable public per-venue JSON/API path. It was checked, honestly,
at Level 1: a single plain GET of `https://shotgun.live/en/venues/rex-club`
returned an HTTP 429 "Vercel Security Checkpoint" response, with its own
retained response headers explicitly carrying `X-Vercel-Mitigated:
challenge` — a genuine, explicit bot/rate-limit access control, not a
parsing failure. No attempt was made to defeat or retry past this
challenge, per `docs/SOURCE_INVESTIGATION_POLICY.md`'s prohibition on
bypassing explicit access controls.

## Decision

`DEFER`. No usable public acquisition path exists for this candidate
within Level 1/2: the venue's own domain has no independently-parseable
event data, and the one credible third-party alternative (Shotgun.live)
is genuinely `BLOCKED`, not merely unexplored. Acquiring this venue's
programme would additionally require browser/headless automation to
observe the client-rendered widget — explicitly out of scope for this
investigation. Every `field_assessment` entry is honestly `UNKNOWN`; no
fact was invented to compensate for the missing data path.
