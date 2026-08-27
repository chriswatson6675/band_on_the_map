# nouveau-casino-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01. Investigates Nouveau
Casino (concert/club venue, 109 rue Oberkampf, 75011 Paris). Official site:
https://nouveaucasino.fr/ (the live `.fr` domain — `.net` is a stale/parked
domain and was deliberately not used, per this investigation's own brief).

## What was found

Level 1 (`PASSIVE_STATIC`): a plain curl GET of the homepage (Kirby CMS,
confirmed by `/media/pages/events/{slug}/` asset paths) returned a fully
static, rich, single-page listing of 27 event cards: weekday, a `DD.MM`
date (no year), a start/end time, title, genre tag, and (where present) a
third-party Ticketmaster link. Title/time/venue all resolve cleanly, but
**no year appears anywhere on the page** and **no internal per-event
detail page exists at all**.

Level 2 (`STRUCTURAL`): `/sitemap.xml`, `/robots.txt`, and one guessed
per-event path (derived from the media-asset naming convention) were all
probed — every one returned this Kirby site's own custom 404 page. No
additional structural path exists that could resolve the year, or provide
a first-party event URL/id.

The card list is genuinely chronologically ordered (day.month values
ascend across the full listing, rolling from `31.10 -> 11.11 -> 12.12 ->
18.12 -> 27.03`), which makes a human reader confident about the intended
year — but that confidence rests on knowing today's real-world date and
assuming ordinary "upcoming events" listing behaviour, which is exactly
the `AI_INFERENCE` this policy prohibits from ever becoming a `PROVEN`
value. `start_date` is honestly recorded `PARTIAL` (day/month known, year
not determinable from retained source content), not guessed.

## Decision

`HUMAN_REVIEW`, with a `CRITICAL` blocker recorded against `start_date`'s
year ambiguity. Title/time/venue quality is otherwise good, and the card
ordering is a genuine, retained structural property a human may reasonably
decide to build a collector-run-time (not investigation-time) deterministic
year-rollover rule around — a materially different, defensible technique
from this investigation asserting a fabricated year itself. No collector
code was written for this venue (per this task's scope, code is only
built for a `READY_FOR_OFFLINE_PROOF`/`READY_FOR_ACTIVATION` decision).
