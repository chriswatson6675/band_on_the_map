# la-boule-noire-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates La
Boule Noire (120 Boulevard de Rochechouart, 75018 Paris; physically linked
to La Cigale next door but a genuinely separate, distinct venue/business).
Official site: https://laboule-noire.fr/

## What was found

The supplied `/en/programmation/162` URL 301-redirects (the Polylang
plugin) to the site's own homepage — which turns out to BE the venue's
live programme listing: a WordPress install using an Elementor "Posts"
widget renders one real `<article>` card per current/upcoming show,
directly in server-rendered HTML, each with its own title and a full
French date+time string on one line (day name, day number, month name,
year, hour — e.g. `"MERCREDI 30 SEPTEMBRE 2026 – 19H30"`). Level 1
(`PASSIVE_STATIC`) was fully sufficient.

Two confirmatory checks ruled out anything cleaner: the only JSON-LD block
on the site is Yoast SEO's own generic `WebPage`/`WebSite`/`Organization`
schema (no `Event` data anywhere), and this install's own `wp-json` REST
API returns HTTP 401 for every route (a security plugin restricts it to
authenticated users) — so `STATIC_HTML`/`STATIC_EVENT_LIST` (matching this
project's existing `badehaus-berlin-01` precedent) is the honest
classification, not a JSON API.

One event detail page (`/alexis-muratti/`) was sampled for its own price:
the page's own numeric heading (`class="prix-event"`, text `"20"`) never
prints a currency symbol in the HTTP response body itself — the `"€"` a
human sees comes purely from that page's own CSS rule
(`.prix-event p:after{content:"€"}`). Combining these two retained,
first-party inputs mechanically yields `"20 EUR"` — a genuine
`DETERMINISTIC_CONTEXT` case (v1.2), not a plausibility guess. The address
`"120 BOULEVARD DE ROCHECHOUART - 75018 PARIS"` is also directly stated in
that same detail page's footer.

## Decision

`READY_FOR_ACTIVATION`. Identity `PROVEN`; `acquisition_class`
`STATIC_HTML`; `title`/`start_date` both `PROVEN` with
`basis: DIRECT_SOURCE` (the full date is on one card line, no contextual
combination needed for either gated field); `source_record_id` `PROVEN`
via this site's own WordPress permalink slug; `price` additionally
`PROVEN` with `basis: DETERMINISTIC_CONTEXT` and a cited `derivation`;
`recommended_family` `STATIC_EVENT_LIST` (bespoke, matching the
`badehaus-berlin-01` precedent — not shared with any other source yet
investigated); `DETERMINISTIC_DERIVATION` offline-proof evidence retained
(`tests/la-boule-noire.test.mjs`, 6/6 passing); no unresolved `CRITICAL`
blocker.

Coordinates: `GEOCODED` via `ingestion/geocoding/nominatim.mjs` — a single,
confident match ("La Boule Noire" at the exact house_number/road/postcode).
