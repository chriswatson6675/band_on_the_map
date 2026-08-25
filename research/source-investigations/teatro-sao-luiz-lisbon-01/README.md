# teatro-sao-luiz-lisbon-01

**This is a real trial investigation of a real venue/source candidate — not
activation.** `decision.status` here is `HUMAN_REVIEW`, meaning this
investigation found the source technically workable but hit one genuine,
policy-relevant judgement call it is not this framework's place to resolve
unilaterally (see "The one real blocker" below). Reaching any decision
status in `investigation.json` is a research conclusion only. It does not
edit `sources/*.json`, any `venues/*.json` registry, or public map data.
Turning this into an active collector is a separate, explicitly-authorised
step — see "Investigation and activation are separate" in
`docs/SOURCE_INVESTIGATION_POLICY.md`.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## What was investigated

**Teatro São Luiz** — officially **"São Luiz Teatro Municipal"** per the
site's own WordPress REST self-description — is a municipal theatre in
Chiado, Lisbon, managed under **EGEAC** (the City of Lisbon's own
cultural-facilities management company; its logo appears in the site's
footer). This investigation targeted the theatre's public English-language
programme listing at `/en/programme/`, given as a candidate lead — verified
independently and found correct, no correction needed.

The theatre's programme is genuinely mixed-discipline (music, theatre,
dance, circus, thinking/talks, exhibitions, etc — an explicit `<select>`
filter vocabulary on the page itself lists 20 categories), not
music-exclusive. Of 26 events retained on the full 2026-2027 season
listing, most (but not all) were tagged `music`; a jazz festival
("Picadeiro Fest 2026") does account for a cluster of the September dates,
consistent with the prior loose note's "co-produces jazz festivals" remark
— but the season also includes standalone theatre, dance, and talk events
spread across October through April, so "moderate yield, festival-only"
undersells the actual breadth a little; "moderate yield, mixed discipline"
is the more accurate independently-verified characterization.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted, and it was
**`SUFFICIENT`**. A single `curl` GET of `/en/programme/` already returned
all 26 current/future event cards for the whole season, fully
server-rendered, no pagination or JavaScript execution needed. Five detail
pages (spanning music, theatre, dance, and one multi-venue festival
umbrella entry) were also plain `curl` GETs. The investigation additionally
inspected the site's **standard, publicly-documented WordPress REST
discovery document** (`/wp-json/`) — a well-known CMS fingerprint, not a
hidden or bespoke endpoint, and still a plain unauthenticated GET, so this
stayed within Level 1 rather than requiring Level 2 JS/bootstrap
inspection. That discovery document revealed one custom route
(`/wp-json/custom/v1/espetaculos`), which was then probed (again, plain
GETs, following its own self-documented required-parameter error message)
across all six months present in the retained programme listing. No
escalation to Level 2/3/4 was needed — the one open gap found (see below)
is a property of the source's own data, not something a browser session or
JS-bundle inspection could resolve.

## Bounded sample

Five events were fetched to detail-page depth (of 26 total on the season
listing):

- **Batucadeiras das Olaias (PT)** — 9 September, free outdoor concert,
  Picadeiro Fest 2026
- **PICADEIRO FEST 2026** — 9–13 September, the festival's own umbrella
  entry, multi-venue, free admission
- **O PAI (The Father)** — 16–27 September, theatre, price range, the only
  sampled page with a `Duration` field (`1h30 aprox.`)
- **As Ilhas Desconhecidas (The Unknown Islands)** — 10–20 December,
  theatre, price range
- **VÁCUO** — 28–31 January (2027, per the auxiliary-API cross-check
  below), dance, "Prices to be confirmed"

One of the five (`batucadeiras-das-olaias-pt`) was fetched a second,
independent time specifically to empirically prove id/body stability.

## The one real blocker: no calendar year, anywhere

This is the central, honestly-documented finding of this investigation.
Every one of the 26 list-page event cards and all 5 sampled detail pages
give a **day, a month name, a weekday name, and a time-of-day** — but
**never a calendar year**, anywhere in the retained static HTML. This was
mechanically confirmed, not assumed: `evidence/offline-proof.mjs` scans all
26 cards' date text for a 4-digit year and finds zero.

This matters concretely because the "2026-2027" season genuinely spans a
calendar-year boundary. The investigation discovered and probed an
auxiliary JSON REST endpoint
(`/wp-json/custom/v1/espetaculos?season=...&month=...`, found via the
site's standard `/wp-json/` discovery document) that *does* carry full
ISO year-inclusive dates for a sparse subset of titles. Querying it for
January returned `"André Rosinha Trio":"2027-01-14"` — which matches the
static list's own `14 jan` card for the same title exactly by date,
**mechanically recovering the year 2027 for that one specific occurrence**,
never invented.

But that same auxiliary endpoint also returned a title —
**`"NA MINHA BOCA"`, 15–17 January 2027** — that does **not appear anywhere**
in the retained static English programme listing at all. Across the 6
sampled months it returned only 11 (date, title) entries in total (mostly
recurring "Visitas Guiadas" guided-tour markers) against 26 real events on
the static list. **This proves the auxiliary endpoint is not a reliable or
complete mirror of the programme** — useful only as a narrow,
best-effort, per-title cross-check for events it happens to also cover,
never as a primary or trustworthy supplementary feed.

Per policy's date/time rule, this investigation does **not** infer "the
current year" or "the season's first year" to fill the gap — that is
exactly the kind of convenient-context guessing the policy prohibits.
`field_assessment.start_date` and `.end` are recorded as `PARTIAL`, not
`PROVEN`, and this is why `decision.status` is `HUMAN_REVIEW`: a human
needs to explicitly choose and own one of (a) a documented season-boundary
year-rollover heuristic, (b) relying on the auxiliary API only for the
minority of events it covers, or (c) accepting year-less/`AMBIGUOUS` dates
for this source — none of which this framework lets an AI investigation
decide unilaterally.

## Other real nuances found and honestly recorded

- **A genuinely stable per-event id exists, but at the wrong granularity
  for multi-day runs.** Every detail page's HTTP response carries a
  standard WordPress `Link: <...?p=NNNNN>; rel=shortlink` header — a
  documented, platform-standard permanent post id. Re-fetching one sampled
  page independently reproduced the identical id (35378) and a
  byte-identical body, empirically proving stability. But a multi-day run
  (e.g. O Pai, 16–27 September) is ONE post/ONE id for the whole run, with
  no structured per-date breakdown at all (unlike Gulbenkian's
  `subEvent[]` array) — only free, sometimes weekday-conditional, text.
- **Weekday-conditional showtimes.** A multi-day run's time-of-day can
  vary by weekday within the same run (e.g. O Pai: "Wednesday to
  Saturday, 8.00 pm; Sunday, 5.30 pm"), not one uniform showtime — a
  collector must parse this, not assume a single time for the whole range.
- **A source-side text typo.** As Ilhas Desconhecidas' detail page reads
  "10 to 20 dDecember" — an evident template/translation glitch, retained
  honestly rather than silently corrected.
- **No JSON-LD, no ICS export, no recognisable calendar plugin.** The site
  is a bespoke WordPress theme (`wp-content/themes/tsl/`) with WPML for
  multilingual `/en/` URLs; events appear to be a custom post type
  rendered directly by the theme, not a third-party calendar plugin.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses every retained HTML/JSON fixture in this
directory and mechanically re-derives every claim above: the 26-card
zero-year scan, per-event title/dates/venue/price/duration extraction for
all 5 sampled events, the empirical id/body stability re-check, and both
the positive (André Rosinha Trio → 2027) and negative (NA MINHA BOCA
absent from the static list) auxiliary-API cross-checks. Run with
`node evidence/offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt` and cited as the investigation's
`DETERMINISTIC_DERIVATION` evidence item. It exited `0` with every check
passing.

## What a future investigator/collector-builder should know

- Recommended collector family: `STATIC_EVENT_LIST` (MEDIUM confidence,
  capped below HIGH specifically by the year gap) — fetch the programme
  list to enumerate current event hrefs (never construct slugs), then
  fetch each href and parse its labelled `Dates and Schedules` / `Venue` /
  `Price` (and, when present, `Duration`) fields; take the stable id from
  the response's own `Link: rel=shortlink` header.
- **Do not build a year-inference heuristic without explicit human
  sign-off** — see "The one real blocker" above. This is the single
  reason `decision.status` is `HUMAN_REVIEW` rather than
  `READY_FOR_ACTIVATION`.
- No `CRITICAL` blockers were found. Two `MAJOR` blockers (the year gap
  itself, and the auxiliary API's proven-unreliable coverage) and two
  `MINOR` blockers (multi-day-run id granularity, one source-side text
  typo) are recorded in `collector_assessment.blockers`.
