# Hot Clube de Portugal — Source Contract Proof

Reviewed: 2026-08-23
Task: BOTM-ICS-01
Registry source ID: `hot-clube-de-portugal` (see `sources/lisbon.json`)

## Canonical Source Identity

- Canonical source name: Hot Clube de Portugal
- Founded 1948 (formalised 1950); oldest jazz club in Portugal
- Official website: https://hcp.pt/
- Official programme page: https://hcp.pt/#clube-programa — this is a
  same-page anchor on the homepage, **not** a separate URL. The homepage
  server-renders the full upcoming-events calendar directly via the
  EventON WordPress plugin (`wp-content/plugins/eventON/`).

This document proves the technical acquisition path only. It does not
change or duplicate the registry's rights assessment — see "Rights" below.

## Acquisition Shape

**`PER_EVENT_ICS`.** Confirmed by direct inspection: every event exposes its
own separate one-`VEVENT` `.ics` download. No central multi-event ICS/feed
was found through the bounded first-party site investigation described
below — that is the proven, evidence-bounded result; it is not a claim
that no such feed could exist anywhere on the site.

- **A single reusable multi-event ICS/calendar feed: NOT FOUND.** The
  homepage HTML and its linked assets were searched for any `webcal:`,
  calendar-subscription, or multi-event export link. The only "subscribe"
  mechanism present is an unrelated Mailchimp newsletter signup form
  (`hcp.us12.list-manage.com`). Within that bounded search, no central
  feed was found.
- **ICS links generated per individual event: YES.** Each event card in the
  homepage's rendered calendar carries its own "Calendário" link.
- Both A and B were investigated within the scope of this proof; only B
  (per-event) was confirmed to exist. `acquisition_shape` is recorded as
  `PER_EVENT_ICS`, and `central_feed_found` as `false`, in
  `fixtures/hot-clube/metadata.json`.

## Exact ICS Discovery Mechanism

Each event's container element carries the stable EventON post ID as an
HTML attribute, independent of the ICS link itself:

```html
<div id="event_3788" class="eventon_list_event ..." data-event_id="3788"
     data-time="1786127400-1786146600" ...>
```

That same event's "Calendário" link is a first-party WordPress
`admin-ajax.php` endpoint:

```html
<a href='https://hcp.pt/cms/admin-ajax.php?action=eventon_ics_download&event_id=3794&sunix=20260802T183000Z&eunix=20260802T225000Z&loca=Parque Mayer&locn=Cineteatro Capitólio'
   class='evo_ics_nCal' title='Adicionar ao calendário'>Calendário</a>
```

URL template:

```text
https://hcp.pt/cms/admin-ajax.php?action=eventon_ics_download
  &event_id={event_id}
  &sunix={start UTC, YYYYMMDDTHHMMSSZ}
  &eunix={end UTC, YYYYMMDDTHHMMSSZ}
  &loca={location address}
  &locn={location name}
```

**Recommended discovery point:** the `data-event_id` attribute on the event
container, not the ICS link's query string — see "Stable Source Identifier
Behaviour" below for why this distinction matters.

**Important, directly tested finding:** the `sunix`/`eunix` parameters are
**client-supplied and not re-validated by the server.** Event 3794 was
re-requested with deliberately wrong values (year 2099); the returned ICS
echoed those wrong values back verbatim in `DTSTART`/`DTEND`. This means the
ICS endpoint is a templating service, not a source of truth for timing — the
authoritative date/time for an event lives in the HTML page's rendered link
(or its `data-time` attribute), which must be parsed correctly *before*
calling this endpoint. A future collector must not treat the ICS response's
`DTSTART`/`DTEND` as independently trustworthy beyond "reflects whatever the
caller asked for."

Also present on the page, but not used or further investigated in this
bounded proof: inline Schema.org `Event` HTML microdata
(`itemscope itemtype='http://schema.org/Event'` with `itemprop='url'`,
`'name'`, `'startDate'`, `'endDate'`, `'eventStatus'`) on each event
container, and a distinct stable permalink pattern
(`https://hcp.pt/events/{slug}/`) used for social-share links. Neither is a
`<script type="application/ld+json">` block, so neither is evidence of a
`JSON_LD_EVENT` acquisition path — they are noted here only as a possible
lead for a future, separately scoped task.

## Sample Retrieval

9 genuine current/future music events were retrieved as individual `.ics`
downloads and retained verbatim, byte-for-byte, in
`fixtures/hot-clube/events/{event_id}.ics`. Full retrieval metadata —
exact URLs, HTTP statuses, content types, and the request-by-request log —
is in `fixtures/hot-clube/metadata.json`, kept separate from the raw
payloads per `docs/SOURCE_REGISTRY.md`'s "research provenance, not a
research dump" principle.

13 live HTTP requests were made in total for this proof: 1 `HEAD` and 1
`GET` against the homepage, 9 `GET`s for the retained sample, and 2
diagnostic `GET`s (a same-parameters re-fetch, and a deliberately-wrong-
timestamp fetch) used only to establish the findings below — those two are
not retained as fixtures. All requests were sequential (no concurrency),
used a bounded 20-second timeout, and a `BandOnTheMap/0.1
source-contract-proof` user agent. No social media was accessed and the
site was not crawled beyond its homepage.

## Observed ICS Fields

Across the 9 retained `VEVENT` blocks:

| Field | Present | Notes |
|---|---|---|
| `UID` | Yes, every event | See "Stable Source Identifier Behaviour" — **not stable across repeated downloads.** |
| `DTSTAMP` | Yes, every event | Present but **not** in UTC form (no trailing `Z`) — see "Timezone Behaviour". |
| `DTSTART` | Yes, every event | UTC form (`YYYYMMDDTHHMMSSZ`) in all 9 samples. |
| `DTEND` | Yes, every event | UTC form in all 9 samples. |
| `LOCATION` | Yes, every event | Plain text, e.g. `Cineteatro Capitólio Parque Mayer`. |
| `SUMMARY` | Yes, every event | Event title. |
| `DESCRIPTION` | Yes, every event | Free text, up to 343 characters observed, unfolded (see below), with escaped commas. |
| `URL` | **No**, none of the 9 | Confirmed absent, not merely unobserved by chance across 9 samples. |
| `STATUS` | **No**, none of the 9 | Confirmed absent. |
| `ORGANIZER` | **No**, none of the 9 | Confirmed absent. |
| Recurrence (`RRULE`/`RDATE`/`EXDATE`) | **No**, none of the 9 | Confirmed absent. |
| `VALUE=DATE` all-day events | **No**, none of the 9 | All 9 samples are timed events. |

`PRODID` is `-//eventon.com NONSGML v1.0//EN` and `VERSION` is `2.0` for
every file — consistent with the EventON plugin identified in the homepage
HTML (`wp-content/plugins/eventON/`).

## Timezone / Date Behaviour

- `DTSTART`/`DTEND`: always UTC form with a trailing `Z` in every retained
  sample. No `TZID` parameter and no bare "floating" local time were
  observed on either property.
- `DTSTAMP`: present but genuinely anomalous — emitted as e.g.
  `20260823T182144`, with **no trailing `Z` and no `TZID`**. RFC 5545
  §3.8.7.2 requires `DTSTAMP` always be expressed in UTC form; this source
  does not comply. The parser (`ingestion/ics/parse.mjs`) correctly leaves
  `dtstamp.iso` as `null` rather than guessing an offset — this is treated
  as a floating/unspecified value, not silently assumed to be UTC.
- No timezone database lookups were needed or performed. Nothing in the
  observed data required one.

## Stable Source Identifier Behaviour

This is the most important finding of this proof, and it directly
contradicts the naive assumption that the ICS `UID` is a safe
deduplication key:

**The ICS `UID` is NOT stable.** Event `3794` was fetched twice with
identical parameters (request 12 in `fixtures/hot-clube/metadata.json`).
The two responses had **different `UID` and `DTSTAMP` values**
(`6a8b2c286d8b1` vs `6a8b2d04cb6f2`), while every other field — `SUMMARY`,
`LOCATION`, `DESCRIPTION`, `DTSTART`, `DTEND` — was byte-for-byte identical.
The `UID` appears to be generated fresh per download (plausibly derived
from the current server timestamp), not stored per-event.

**The actual stable identifier is the EventON `event_id`** — the value
carried in the discovery link's `event_id` query parameter and,
independently and more robustly, in the `data-event_id` attribute on the
event's container element in the programme page HTML. Critically,
`event_id` **does not appear anywhere inside the ICS payload itself** — it
only exists at the HTML discovery layer, not in the downloaded `.ics` file.

Consequence for any future collector: the ICS parser (generic, see below)
correctly preserves whatever `UID` a given download happened to contain,
because that is genuine source material and must not be discarded — but a
future collector must **not** use that `UID` as `source_record_id`. It must
instead carry `event_id` through from the HTML discovery step and use that
as the stable per-event identifier, treating the ICS `UID` as auxiliary,
per-download metadata only.

## Escaping and Line-Ending Behaviour

- **Escaping observed:** only backslash-escaped commas (`\,`) — 19
  occurrences across the 9 fixtures, all within `DESCRIPTION` values. No
  escaped semicolons (`\;`) and no escaped-newline sequences (`\n`/`\N`)
  were observed anywhere.
- **Line folding:** none observed. Every property — including a
  343-character `DESCRIPTION` — is emitted unfolded on a single line,
  exceeding RFC 5545's 75-octet folding recommendation without folding.
  The parser still implements folding support defensively for reuse
  against other future sources; it is simply unexercised by this source's
  real data.
- **Line endings: mixed within every single retained file.** The first two
  lines (`BEGIN:VCALENDAR`, `VERSION:2.0`) are CRLF-terminated; all
  remaining lines — from `PRODID` onward, including everything inside
  `VEVENT` — are LF-only. This exact pattern repeats identically across
  all 9 fixtures, so it reads as a stable server-side quirk rather than
  per-request noise. The parser splits on `\r\n`, `\n`, or bare `\r`
  uniformly and does not assume a consistent terminator within one file.

## Parsed Into Deterministic Source Records: Yes

All 9 retained fixtures parse cleanly and deterministically via
`ingestion/ics/parse.mjs`'s `parseICS()`, producing exactly one event
record per file (9 total `VEVENT`s across 9 files), with `uid`, `summary`,
`description`, `location`, `dtstart`, `dtend`, and `dtstamp` populated, and
`url`/`status`/`organizer` correctly left `null` (genuinely absent from the
source, not a parsing failure). See `tests/ics-parse.test.mjs` and
`tests/hot-clube-fixtures.test.mjs`.

## Limitations

- Only 9 near-term events (Aug 2026) were sampled; the shape of `VEVENT`
  fields for events further in the future, or historical/past events, was
  not investigated and could differ.
- `DTSTART`/`DTEND` accuracy from the ICS endpoint alone cannot be trusted
  — see "client-supplied and not re-validated" above. Any future collector
  must derive timing from the HTML page (or its `data-time` attribute), not
  merely from calling the ICS endpoint with a guessed `event_id`.
- `event_id` values are not necessarily contiguous or predictable; they
  must be discovered from the HTML programme page each run, not brute-forced.
- No investigation was made of whether `event_id` values get reused/recycled
  after an event is removed from the programme page.
- The inline Schema.org microdata and the `/events/{slug}/` permalink
  pattern were noticed but not investigated — a future task could establish
  whether either offers a more robust discovery or acquisition path.
- This proof covers only Hot Clube's main homepage calendar. The registry
  entry's `overlap_notes` mention a second programme, "Há Jazz no Parque
  Mayer" at Capitólio — evidence for that appeared within these same
  9 samples (several `LOCATION` values are `Cineteatro Capitólio Parque
  Mayer`), so it is not a separate acquisition path requiring separate
  proof; it is simply a subset of the same homepage calendar.

## Technical Monitoring Conclusion

**TECHNICALLY_PROVEN:** yes. The per-event ICS acquisition path is real,
reachable with a plain HTTP GET and no authentication, returns
well-formed, deterministically parseable `text/calendar` content, and its
discovery mechanism (the `data-event_id` attribute on the homepage) is
stable and documented above. `monitoring_status` is updated to
`TECHNICAL_PATH_PROVEN` accordingly (see "Registry Update" below).

**RIGHTS_CLEARED: no — deliberately not addressed here.** This proof
establishes *technical* suitability only. It does not review, and does not
change, `rights_status`. Whether Band on the Map is *permitted* to collect,
store, and redisplay this content is an entirely separate question,
answered by `docs/DATA_RIGHTS.md` and a future, deliberate rights review —
not by the fact that the endpoint is reachable and unauthenticated. Per
`docs/SOURCE_REGISTRY.md`, public accessibility is never treated as
redistribution permission.

## Rights

`rights_status` remains **`UNKNOWN`**, unchanged from the registry's
pre-existing preliminary state. No explicit first-party terms, licence, or
robots/reuse statement was discovered incidentally during this bounded
technical proof (none was specifically searched for either — that is
out of scope for this task per the brief's "do not conduct broad legal
research" instruction). `rights_status` is **not** upgraded to `GREEN` or
`AMBER` merely because the `.ics` files are publicly reachable without
authentication — see `docs/DATA_RIGHTS.md`: public accessibility is not
redistribution permission.

## Registry Update

`sources/lisbon.json`'s `hot-clube-de-portugal` entry was updated as
follows, and only as follows:

| Field | Before | After |
|---|---|---|
| `monitoring_status` | `READY_FOR_TECHNICAL_PROOF` | `TECHNICAL_PATH_PROVEN` |
| `lifecycle_status` | `DISCOVERED` | `TECHNICALLY_REVIEWED` |
| `acquisition_path_detail` | (research-only description) | concise proven-path description, see below |
| `last_reviewed_at` | `2026-08-23` | `2026-08-23` (this proof; date unchanged, same day) |
| `rights_status` | `UNKNOWN` | **`UNKNOWN` — unchanged** |

`lifecycle_status` moved to `TECHNICALLY_REVIEWED` only — not
`RIGHTS_REVIEWED`, and not `ENABLED`. No collector was built and no
production monitoring was enabled.

## Observation Mapping (Documentation Only — Not Implemented)

This is how a parsed record would later map onto an `Observation` per
`docs/ARCHITECTURE.md`, once a collector actually exists (future work, not
built in this task):

```text
source_id        = "hot-clube-de-portugal"           (registry entry id)
source_record_id = event_id                            (from the HTML
                                                          data-event_id
                                                          attribute — NOT
                                                          the ICS UID,
                                                          see above)
retrieved_at     = the collector's own retrieval timestamp
raw_payload      = the original, unmodified HTTP response body the
                    collector itself received (the exact bytes — this
                    project's fixtures/hot-clube/events/*.ics files are
                    that byte-faithful record for the 9 retained samples;
                    a future collector must retain its own live response
                    the same way, not substitute a parser convenience field)
parsed fields    = ParsedEvent.{summary, description, location,
                    dtstart, dtend, dtstamp, url, status, organizer}
                    — NOT ParsedEvent.unfoldedBlock, which is normalized,
                    already-unfolded parser-level text, not raw evidence
                    (see ingestion/ics/parse.mjs's parseVEvent() doc comment)
```

No persistent Observation storage, deduplication, canonical Event
creation, or Venue resolution is implemented by this task — this section
is documentation of the intended future mapping only.
