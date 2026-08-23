# Teatro Variedades & Capitólio — Source Contract Proof

Reviewed: 2026-08-24
Task: BOTM-MULTISOURCE-LINKS-01
Registry source ID: `teatro-variedades-capitolio` (see `sources/lisbon.json`)

This document proves that the venue Cineteatro Capitólio – Teatro Raul
Solnado — already canonical in `venues/lisbon.json` as
`venue-lisboa-cineteatro-capitolio-teatro-raul-solnado`, and already
referenced by both AgendaLX and Hot Clube de Portugal Observations — also
publishes its own first-party event pages, and that those pages can
become a genuinely independent Observation **Source**, distinct from Hot
Clube de Portugal, without conflating SOURCE, VENUE, or EVENT.

## Canonical Source Identity

- Canonical source name: Teatro Variedades & Capitólio
- Official website: https://teatrovariedades-capitolio.pt/
- Confirmed first-party via: `og:site_name` meta tag reading "Teatro
  Variedades & Capitólio"; the site's own WordPress theme path
  (`wp-content/themes/variedades-capitolio/`); and its dedicated
  ticketing subdomains (`capitolio.bol.pt`, `hajazznoparquemayer.bol.pt`,
  `teatrovariedades.bol.pt`).

This is a **new Observation Source**, not a duplicate of the canonical
Venue record. `venues/lisbon.json`'s existing Capitólio entry is
untouched by this task — see "Jurisdiction/architecture rule" below.

## Bounded Proof Scope

Five candidate individual event pages, all part of the venue's own
"Há Jazz no Parque Mayer!" series, were investigated — the same five real
gigs already proven from Hot Clube de Portugal's side under
`BOTM-ICS-01`/`BOTM-HOT-CLUBE-EVENT-URL-01` (event_ids 3794, 3795, 3797,
3799, 3801):

1. `https://teatrovariedades-capitolio.pt/evento/hugo-lobo-trio-convida-madalena-caldeira/`
2. `https://teatrovariedades-capitolio.pt/evento/joao-nogueira-quarteto-toca-coltranes-sound/`
3. `https://teatrovariedades-capitolio.pt/evento/mateus-saldanha-trio/`
4. `https://teatrovariedades-capitolio.pt/evento/marta-garrett-assanhado-quarteto/`
5. `https://teatrovariedades-capitolio.pt/evento/bode-wilson/`

All 5 were verified live (`GET`, `HTTP 200`, `text/html; charset=UTF-8`)
— not assumed from the task's candidate list. 6 live requests were made
in total for this proof (1 homepage identity check + the 5 event pages
above), sequential, bounded, `teatrovariedades-capitolio.pt` only. No
ticketing site was crawled or scraped.

## Per-Page Facts Extracted

Each page's own rendered hero block and event-content section (not the
sitewide "Bilhetes" ticket drawer, which lists whatever is currently on
sale across the whole site regardless of which page renders it) supplied:

| Field | Where found |
|---|---|
| Title | `<h1>` |
| Series tagline | The line directly under the `<h1>` ("Há Jazz no Parque Mayer!") |
| Date | A `dd.mm.yyyy` text directly under the tagline |
| Time | The "Horários" field in the event-content section |
| Sub-venue text | The "Local" field |
| Duration | The "Duração" field |
| Age rating | The "Classificação etária" field |
| Price (where shown) | The "Preço" field |
| Ticket URL (where shown) | A page-specific "Comprar bilhetes" CTA anchored inside the event-content section — distinguished from the sitewide ticket-drawer fragment, which repeats identically on every page regardless of that page's own event |

Full extracted facts for all 5 pages are retained in
`fixtures/capitolio/events.json`. Only 1 of the 5 (Bode Wilson) currently
shows a price ("5€") and a page-specific ticket link; the other 4 show
neither — an honest negative finding, not an omission.

## Stable Source Identifier

No numeric or post ID is rendered anywhere in a Capitólio event page's
own HTML body — no `postid-*` body class, no `wp-json` REST-discovery
`<link>`, no numeric ID printed in visible or hidden markup. The safest
directly-evidenced fallback is the WordPress post ID exposed in that
page's own HTTP response header:

```text
Link: <https://teatrovariedades-capitolio.pt/?p=2908>; rel=shortlink
```

This is genuinely first-party, server-issued, and stable — unlike the
URL slug (editorial text, not guaranteed permanent) or a synthetic
per-fetch index. `source_record_id` for every Capitólio Observation is
this numeric post ID, carried from the response header, never guessed
and never a Hot Clube `event_id`.

| Hot Clube `event_id` | Capitólio page | Capitólio `wp_shortlink_post_id` |
|---|---|---|
| 3794 | hugo-lobo-trio-convida-madalena-caldeira | 2908 |
| 3795 | joao-nogueira-quarteto-toca-coltranes-sound | 2909 |
| 3797 | mateus-saldanha-trio | 2911 |
| 3799 | marta-garrett-assanhado-quarteto | 2913 |
| 3801 | bode-wilson | 2915 |

## Cross-Source Association (not a canonical Event)

`ingestion/association/hot-clube-capitolio.mjs` associates each Hot Clube
Observation with its corresponding Capitólio Observation for **display
only**, using evidence independently re-verified against the real
Observation data at call time (not merely declared): the same
`start.date`, resolution to the same canonical `venue_id`, and
deterministic (non-fuzzy) word-level performer/title correspondence. All
5 declared pairs above were confirmed associated by this evidence. Both
Observations are always preserved by reference — nothing is merged,
deduplicated, or promoted into a canonical Event.

Where the two sources' own facts differ (title wording, raw date/time
representation, venue sub-location text, and — for Bode Wilson only —
price), `ingestion/association/compare-facts.mjs` retains both values
side by side rather than silently choosing one; see
`fixtures/map/lisbon-map-proof.json`'s `display_listings[].fact_comparison`.

## Rights

`rights_status` is **`UNKNOWN`**. No explicit first-party terms, licence,
or robots/reuse statement was discovered incidentally during this
bounded technical proof (none was specifically searched for — that is
out of scope here, matching `docs/sources/HOT_CLUBE.md`'s precedent).
Not upgraded to `GREEN`/`AMBER` merely because the pages are publicly
reachable without authentication — per `docs/DATA_RIGHTS.md`, public
accessibility is not redistribution permission. Not downgraded to `RED`
either, since no retained evidence shows an explicit prohibition.

## Jurisdiction/Architecture Rule

This proof adds a new **Source** registry entry only. It does not touch
`venues/lisbon.json`'s existing canonical Venue record, its coordinates,
or its evidence — those remain exactly as proven under `BOTM-VENUE-01`.
It does not create a canonical Event. It does not implement the Offer
model — the one retained ticket URL (Bode Wilson) is kept as
`source_fields.ticket_url` metadata only.
