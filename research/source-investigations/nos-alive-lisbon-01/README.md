# nos-alive-lisbon-01

**This is a real trial investigation of a real source candidate — not
activation.** `investigation.json` is the authoritative structured record;
this file is explanatory only and carries no independent authority, per
`docs/SOURCE_INVESTIGATION_POLICY.md`.

## What was investigated

**NOS Alive** — a major annual outdoor rock/pop festival at Passeio
Marítimo de Algés, Oeiras (Lisbon metro area), Portugal. A registry entry
already existed at `sources/lisbon.json` (`id: "nos-alive"`,
`official_website: "https://nosalive.com"`, `lifecycle_status: "DISCOVERED"`,
`monitoring_status: "NEEDS_TECHNICAL_REVIEW"`), which this investigation
treated strictly as a discovery lead and pre-existing context, not as
evidence in itself. Every finding below was independently re-established
from this investigation's own freshly retained material. **No file under
`sources/*.json`, `venues/*.json`, `venues/manual-coordinates.json`, or
`data/public/*` was read for the purpose of extracting facts (only the one
`nos-alive` registry entry was read up front, as instructed) or modified by
this investigation.**

## The headline finding: is this a good fit for the Event/Observation model at all?

**No — not structurally, regardless of acquisition mechanics.** NOS Alive is
one single annual, whole-festival, multi-day ticketed event (day / 2-day /
3-day passes sold for the festival as a whole), not a venue that produces
many separately dated, separately ticketed shows through the year. Forcing
this into the project's recurring Source → Event/Observation model would
either yield only one Event record per year (very low ongoing value for a
governed collector to maintain) or would misrepresent the festival's
internal day/stage/act programme as if each act were a separately
purchasable "event", which it is not. This alone — per this task's own
explicit framing — is legitimate grounds to `DEFER` rather than force-fit an
acquisition design around a single yearly announcement.

## A second, independent, evidenced reason: the site's own dates currently disagree with themselves

This is not a hypothetical concern — this investigation found a **real,
retained, first-party inconsistency** on the live site and had to resolve
it carefully rather than guess:

- The homepage's own JSON-LD meta description and the ticket page's own
  Ticketline URL/2-day-pass labels state the upcoming, `NOS Alive'27`-labelled
  edition runs **8, 9, 10 July**.
- The three static "day" pages' own `<title>` tags read **09/10/11 de
  Julho**, and the lineup ("cartaz") page displays a full per-stage/per-time
  table for **9/10/11 July**.

These turned out **not** to be a live contradiction about the same edition,
once each page's own edition label was read carefully:

- The cartaz table's own HTML element `id` is literally `tablepress-2026`,
  its own JSON-LD description self-labels `NOS Alive'26`, and a linked
  news-archive post is timestamped `2026-07-09T15:03:45+00:00` and
  explicitly captions that as day 1 of `NOS Alive'26` — i.e. this is the
  **already-concluded 2026 edition's** archived lineup (independently
  matching this project's own pre-existing registry note, "2026 edition
  confirmed 9-11 July"), not a disagreement about the upcoming one.
- More subtly: **each of the three "day" pages has its own internal,
  same-page inconsistency.** Its `<title>` tag (09/10/11 de Julho, stale)
  disagrees with its own **displayed `<h1>`** heading (08/09/10 JUL
  respectively) — and the `<h1>` is what a visitor actually sees. All three
  pages were modified `2026-08-24` (per their own retained `dateModified`),
  consistent with an editor updating the visible content for the next
  edition without updating the separate, manually-set SEO `<title>` field.

Combining the day-pages' own current `<h1>` values (08/09/10 JUL, in
day-1/day-2/day-3 order) with the `'27` edition's own year — itself
confirmed via a **literal 4-digit "2027"** in an official ticket-vendor URL
the site links from its own ticket page
(`nos-alive-festival-lisbon-2027`) — yields exactly one result:
**2027-07-08 to 2027-07-10**, independently corroborated by the homepage's
own prose and the ticket page's own day-combination pass labels. This was
mechanically re-verified, offline and dependency-free, in
`evidence/offline-proof.mjs` (15/15 checks pass).

`field_assessment.title`, `start_date`, and `end` are therefore marked
`PROVEN` with `basis: "DETERMINISTIC_CONTEXT"` and a full `derivation`
object each — a genuine, reproducible combination of ≥2 retained first-party
inputs, never `AI_INFERENCE`, never guessed from "today's date looks about
right".

## Why this still doesn't support `READY_FOR_ACTIVATION`

Being able to work out the date **this one time**, carefully, with full
retained evidence, is not the same as a **reliable, unattended, yearly
collector**. `collector_assessment.blockers` records this honestly:

- **CRITICAL** — resolving the date required cross-referencing five
  separate pages and untangling two real inconsistencies (a same-page
  `<title>`-vs-`<h1>` disagreement, and a same-URL-family prior-edition vs.
  current-edition mix-up). A fixed, mechanical parsing rule cannot safely
  reproduce this disambiguation every year without real risk of silently
  ingesting a stale prior edition's dates as current.
- **MAJOR** — the structural single-annual-festival mismatch described
  above.
- **MINOR** — no `Event`/`MusicEvent` JSON-LD, ICS, RSS, or public
  per-event JSON API exists anywhere (only a generic Yoast SEO
  `Organization`/`WebSite`/`WebPage` graph); the one bespoke REST route
  found (`/wp/v2/alive`) returns stage-name taxonomy terms, not event
  records.
- **MINOR** — no stable per-edition `source_record_id`: page slugs
  (`primeiro-dia`, `nosalive-cartaz`, etc.) are static and get
  overwritten/reused year over year rather than being unique per edition.

## Escalation ladder

- **Level 1 (`PASSIVE_STATIC`) — `INSUFFICIENT`.** Plain `curl` GETs of the
  homepage, lineup page, all three day pages, the ticket page, and one
  news-archive page all returned fully server-rendered `200 OK` HTML. No
  `Event`/`MusicEvent` JSON-LD, RSS, or ICS was found anywhere — only prose,
  a static HTML table, and page headings, several of which disagree with
  each other (see above). Insufficient to expose a structured, reliable
  event-data path on its own.
- **Level 2 (`STRUCTURAL`) — `INSUFFICIENT`.** The site's own `wp-json` REST
  root (advertised via the homepage's own `Link` header) was fetched and its
  full route list inspected. The only non-core route,
  `/wp/v2/alive`, is a stage-name taxonomy, not event/date records. No
  public JSON/feed/API path exposing structured event data was found.
- **Level 3+ not attempted.** Per `docs/SOURCE_INVESTIGATION_POLICY.md`,
  `DEFER` never requires exhausting the ladder, and nothing a browser
  session could observe would change either the structural mismatch or the
  data-reliability findings above.

## Bounded sample

Nine live fetches, all `curl`, all retained byte-faithfully:

- `https://nosalive.com/` (homepage)
- `https://nosalive.com/nosalive-cartaz/` (lineup — proved to be the stale
  2026 edition)
- `https://nosalive.com/primeiro-dia/`, `/segundo-dia/`, `/terceiro-dia/`
  (the three per-day pages)
- `https://nosalive.com/bilheteira/` (tickets)
- `https://nosalive.com/confirmacoes-palco-portico/` (a news-archive page,
  used to establish the site's own edition-label-to-calendar-year
  convention)
- `https://nosalive.com/wp-json/` (REST API root)
- `https://nosalive.com/wp-json/wp/v2/alive` (the one bespoke REST route)

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses the retained HTML fixtures in this directory and
mechanically reproduces every claim above: the homepage/ticket-page `'27`
date statements, each day-page's own `<h1>`-vs-`<title>` disagreement, the
cartaz/news-archive pages' own `'26` self-labelling, and the combined
title/start_date/end derivation. Run with `node evidence/offline-proof.mjs`;
its captured stdout is retained at `evidence/offline-proof-output.txt` and
cited as the investigation's `DETERMINISTIC_DERIVATION` evidence item. It
exited `0` with all 15 checks passing.

## Decision

**`DEFER`** — not `REJECT` (the site could plausibly be revisited later:
once this project has a deliberate design for modeling single annual
multi-day festivals as a distinct pattern rather than forcing the
venue-calendar Event model, and/or once the site's own edition content is
next observed to be internally self-consistent), and not
`READY_FOR_ACTIVATION` (no reliably-repeatable, unattended acquisition
exists today, for both a structural and a data-reliability reason, detailed
above). This is a research conclusion only — it does not edit
`sources/*.json`, any `venues/*.json` registry, or any other live registry.

## What a future investigator should know

- If this project later adds a distinct pattern for single annual
  multi-day festivals (rather than the venue-calendar Event model), this
  investigation's evidence and derivation logic can likely be reused
  directly.
- Re-check the day-pages' `<title>` vs `<h1>` situation on any future visit
  — this investigation found the `<h1>` to be the trustworthy, current
  value and the `<title>` to be stale, but that pattern is itself a site
  content-management quirk, not a guaranteed-stable convention a collector
  could hardcode.
- The `/wp/v2/alive` taxonomy route could be worth re-checking in future if
  the site ever adds a genuine event/schedule custom post type alongside
  it — this investigation only found stage-name terms, not event records.
