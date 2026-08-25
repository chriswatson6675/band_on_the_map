# hot-five-porto-01

**This is a real trial investigation of a real venue/source candidate — not
activation.** Reaching `decision.status: "READY_FOR_ACTIVATION"` in
`investigation.json` is a research conclusion only. It does not edit
`sources/*.json`, any `venues/*.json` registry, or public map data. Turning
this into an active collector is a separate, explicitly-authorised step —
see "Investigation and activation are separate" in
`docs/SOURCE_INVESTIGATION_POLICY.md`.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## What was investigated

**Hot Five Jazz & Blues Club** — a small, single-room, single-address live
music club in Porto, Portugal (legal operator "Deztrezepauta, Lda."). The
task-provided candidate URL `https://hotfive.pt/` was independently
verified as the venue's genuine official presence (self-published legal
name, Portuguese tax id, street address, phone, on-domain email, matching
Instagram handle). The actual event-listing content lives at a dedicated
page, `https://hotfive.pt/shows/`, reachable from the home page's own "See
All" buttons — `official_url` in `investigation.json` was corrected to
point there.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted, and it was
**`SUFFICIENT`** — no escalation to Level 2/3/4 was needed. Plain `curl`
GETs (following this WordPress site's benign wp-cron redirect with `-L`)
of the home page and `/shows/` already returned fully server-rendered
Elementor page-builder HTML: 52 event cards on `/shows/` (grouped under
JULY/AUGUST/SEPTEMBER headers) and a 4-card rolling excerpt on the home
page. A further plain `curl` GET fully enumerated the site's own `wp-json`
REST discovery root (294 routes — none of them an event/show/calendar
content route) and the site's advertised RSS feed (only stale 2016-2023
theme-demo placeholder posts). No JS bundle inspection, API discovery
beyond a plain GET, or browser session was ever needed.

## The core finding: no calendar year, anywhere, ever

This is the central, deliberately-not-glossed-over result of this
investigation. Every one of the 52 event cards' date strings is `"DD mon"`
(a day number + a 3-letter Portuguese month abbreviation, e.g. `"28 ago"`,
`"03 set"`) — **never a year**. `evidence/offline-proof.mjs` mechanically
regex-checks all 56 combined date strings (52 from `/shows/` + 4 from the
home page) and proves zero contain a 4-digit year.

This investigation deliberately did **not** repeat the exact mistake this
task's own context flags from a prior, unflagged loose fetch of this same
venue: it never used the page's `article:modified_time` (a WordPress
page-*edit* timestamp), never used a `/wp-content/uploads/2026/07/...`
image-upload-folder path (when a FILE was uploaded, not when a show
happens), and never assumed "the current year" from today's date. A
single third-party ticketing page (`lebillet.eu`, linked from hotfive.pt's
own "Buy tickets" buttons) does independently state a full year in its own
`<title>` (`"...28, Agosto, 2026 | LeBillet"`) — retained as real evidence
(`ev-lebillet-1981`), but per `docs/SOURCE_INVESTIGATION_POLICY.md`'s
"Third-party sources" rule this is **not** used to promote
`field_assessment.start_date` to `PROVEN`. It stays honestly `PARTIAL`.

## Bounded sample

All 52 event cards on `/shows/` were parsed (day+month text, title, ticket
href presence/absence) — this is itself a small, single, bounded page
fetch, not a multi-page crawl. Of those, this investigation's offline
proof separately prints a documentation-only "current/future relative to
2026-08-25" sub-list of 20 cards (28 Aug – 27 Sep) — this sub-list is
**never** written into `investigation.json` as a proven date, precisely
because the year that would make "current/future" a real claim is not
actually stated by the source. No individual first-party event detail
pages exist on hotfive.pt to sample separately — every event card's only
outbound link goes straight to the third-party ticketing platform.

## Real nuances found and honestly recorded (not smoothed over)

- **The source disagrees with itself by one year about its own founding
  date**: `og:description` says "Since 2005", the page's own visible body
  text says "Since 2006, the Hot Five Jazz&Blues Club has been a cultural
  landmark". Noted in `identity.notes`, does not affect identity
  confidence.
- **No first-party per-event URL, ID, or price exists.** `event_url` and
  `price` are both `NOT_PRESENT`. The only per-event identifier observed
  (a numeric id embedded in the outbound `lebillet.eu` href) belongs to a
  third-party ticketing vendor, not hotfive.pt itself, and was only
  observed via one fetch — `source_record_id` is `PARTIAL`, with a
  documented alternative strategy (a first-party `title + date-text`
  composite key, proven unique across all 52 cards in this snapshot).
- **`wp-json` and the RSS feed were both actively checked and ruled out**,
  not left uninvestigated: `wp-json` has zero event/show/calendar content
  routes (294 routes fully enumerated); the RSS feed holds only 10 stale
  WordPress-theme-demo posts from 2016–2023.
- **The page does not prune past events** — July dates were still listed
  on `/shows/` alongside current August/September ones at fetch time.
- **One venue-wide opening-hours line exists** ("Das 21h30 às 02h30",
  "Quinta à domingo" = Thursday–Sunday, matching the task's prior loose
  note about a Thu–Sun cadence) but it is venue-wide, not per-event — kept
  out of `field_assessment.time`, which is honestly `NOT_PRESENT`.
- **One card gives an irregular combined two-day date string** ("10 & 11
  jul" for "The House of Gatsby") instead of two separate cards like other
  multi-day acts.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses every retained fixture in this directory and
mechanically re-derives every claim above: the 52+4 event-card extraction,
the zero-year-string proof, the home/shows subset match, the composite-key
uniqueness check, the shared-address/opening-hours check, the
`wp-json`/RSS ruling-out, and the third-party year corroboration. Run with
`node evidence/offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt` and cited as the investigation's
`DETERMINISTIC_DERIVATION` evidence item. It exited `0` with every check
passing. `evidence/validate-record.mjs` is a small, optional, non-evidence
sanity script that imports the real `validateInvestigationV1_1` from
`ingestion/source-investigation/contract.mjs` and confirms
`investigation.json` validates with 0 errors.

## Decision: `READY_FOR_ACTIVATION`, with one MAJOR blocker impossible to miss

`collector_assessment.blockers` carries exactly one **MAJOR** entry (the
missing year — resolving it needs a separate, explicitly-authorised
human/operator decision at collector-build time, not a guess made here)
and four **MINOR** entries (past-event retention, id/composite-key
caveats, ticketless cards, one irregular multi-day date string). None
`CRITICAL`. The activation gates in
`docs/SOURCE_INVESTIGATION_POLICY.md` explicitly allow an honestly-`PARTIAL`
(not `UNKNOWN`/`NOT_PRESENT`) `start_date` and a documented alternative
`source_record_id` strategy to support `READY_FOR_ACTIVATION` — this
investigation uses that allowance deliberately, not as a loophole: the
extraction mechanics themselves are simple, deterministic, and fully
offline-proven; what remains open is a genuine, clearly-flagged,
separately-decided policy question about how a future collector resolves
the year, which this investigation does not decide unilaterally.

## What a future investigator/collector-builder should know

- Recommended collector family: `STATIC_EVENT_LIST` — fetch
  `https://hotfive.pt/shows/`, parse each Elementor icon-box card for
  title/date-text/ticket-href, do not expect JSON-LD, an API, or a
  calendar plugin.
- **Do not activate a real collector against this source until the MAJOR
  year blocker has an explicit, separately-approved resolution.** Do not
  silently assume "current year" and do not silently promote the linked
  third-party ticketing page to first-party authority.
- Handle the 5 ticketless cards and the one irregular two-day date string
  explicitly; don't assume every card is a uniform single-date,
  single-link record.
