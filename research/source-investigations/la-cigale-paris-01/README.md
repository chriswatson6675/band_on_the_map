# la-cigale-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates La
Cigale, 120 Boulevard de Rochechouart, 75018 Paris. Official site:
https://lacigale.fr/, events at `/en/lineup/`.

## What was found

Level 1 (`PASSIVE_STATIC`) was genuinely insufficient: the retained page's
event list container is empty in the static HTML
(`<ul class="artiste-event artiste-event--prog"></ul>`), populated only by
client-side jQuery after load. The page's own JSON-LD is Yoast SEO
boilerplate (WebPage/BreadcrumbList/WebSite/Organization) — no Event data
at all. This confirms a prior discovery pass's finding of a stale "no
events match" state, though the actual cause is a genuinely empty
container, not a date-filter bug.

Level 2 (`STRUCTURAL`) came back `BLOCKED`, not `INSUFFICIENT`: this
site's own WordPress REST API root (`https://lacigale.fr/wp-json/`)
explicitly refuses unauthenticated access across its entire surface —
`401 {"code":"rest_cannot_access","message":"DRA: Only authenticated
users can access the REST API."}` — a deliberate access control, not a
missing route. The one custom-plugin JS file the page itself references
(`sedona-shortcodes/programmation/moment.min.js`) turned out to be only a
vendored copy of the general-purpose `moment.js` library, with no
endpoint-construction code of its own (unlike `olympia-paris-01`'s theme
bundle). Per policy, `BLOCKED` terminates escalation — this project never
attempts to defeat an explicit access control, and this investigation's
own scope does not extend to Level 3/4 (browser/headless) work regardless.

One genuine positive finding: the venue's own JSON-LD directly states its
own name, address, and geo-coordinates (48.8822, 2.3403) — so `identity`
is confidently `PROVEN` even though no event data acquisition path exists.
Those two questions are independent, and this investigation is honest
about both.

## Decision

`DEFER` — a valid, complete outcome. No collector module, fixture, or
offline test was built (no acquisition path exists to prove one against).
No `sources/paris.json` or `venues/paris.json` entry is proposed.
