# cm-gondomar-agenda-01

Governed source investigation of **Câmara Municipal de Gondomar's public
Agenda** (`https://www.cm-gondomar.pt/agenda/`), the Gondomar municipality's
own events/cultural-agenda calendar in the Porto metro area, Portugal.

This directory (`investigation.json` + this README + `evidence/`) is the
authoritative record per `docs/SOURCE_INVESTIGATION_POLICY.md`
(`BOTM-SOURCE-INVESTIGATION-v1.2`). `investigation.json` is authoritative;
this file is explanatory only. This investigation targets the existing
`sources/porto.json` registry candidate `cm-gondomar-agenda`
(`lifecycle_status: DISCOVERED`) — it does **not** edit that file, any
`venues/*.json` registry, `venues/manual-coordinates.json`, or any
`data/public/*` file.

## What this investigation found

**The acquisition problem is fully solved; the data problem is not.**

- The `/agenda/` page is genuinely server-rendered WordPress (custom theme
  `gsk-portal-institucional`), not a client-rendered SPA — Level 1
  (`PASSIVE_STATIC`) confirmed real event cards (title, date-text,
  permalink, poster image) immediately.
- Level 1 alone could not mechanically isolate **music** from Gondomar's
  full civic calendar (council meetings, sports, markets, etc.) — the
  page's own 21-option "Categoria" filter (including `Música`, term id
  `56`) is applied client-side via JS, not baked into a static/linkable
  URL, and the site's advertised RSS feed turned out to be a generic
  sitewide press/news feed, unrelated to the `eventos` agenda content type.
- Level 2 (`STRUCTURAL`) found the fix: the filter dropdown is backed by a
  genuine, public, unauthenticated `POST wp-admin/admin-ajax.php`
  (`action=search_events`, `data[category]=<term_id>`) that reliably,
  server-side filters to the source's own `eventos-categorias` taxonomy —
  confirmed by the JSON response's own `paginationData.tax-query` echoing
  back exactly what was requested. This is the **same first-party
  category-tag pattern** already proven for
  `ingestion/cm-gaia-eventos/discovery.mjs` and
  `ingestion/odivelas/discovery.mjs` — a real, mechanical, non-AI way to
  isolate real music events (concerts, recitals, festivals — sampled and
  confirmed genuinely music-relevant, not markets/sports/council
  meetings). `category=56` alone returned **140 music-tagged events** across
  this source's full history (50 retained in the bounded sample).
- **But the date field never carries a year, anywhere, ever.** Every event
  states only a day + unabbreviated month (`"20 Setembro"`,
  `"28 Novembro"`, `"21 Agosto - 22 Agosto"` for ranges) — on the index
  cards, on the category-filtered AJAX cards, and on both independently
  sampled per-event detail pages alike. No page/section/listing-level
  heading establishes a governing year either (unlike this project's own
  CM Gaia precedent, whose date field *always* includes the year, e.g.
  `"20 Set 2026"`, or the policy's own `DETERMINISTIC_CONTEXT` worked
  example — a month/year heading governing day-only cards). This is
  mechanically proven, not asserted: `evidence/offline-proof.mjs`
  re-parses every retained fixture and scans all 58 distinct retained
  date-text values for a 4-digit year token; **zero matches**.
- Filename/path-derived year candidates (WordPress
  `wp-content/uploads/<year>/<month>/` upload paths; occasional
  year-suffixed permalink slugs on recurring annual events, e.g.
  `concurso-internacional-de-musica-de-gondomar-2026`) were considered and
  rejected as a derivation basis — non-universal (most slugs, including the
  primary sampled event, carry no year at all), not something the source
  itself documents as its date semantic, and **exactly the same heuristic
  this candidate's own prior desk-research note already tested and
  rejected** (`sources/porto.json`'s existing `research_notes` for
  `cm-gondomar-agenda`, from `PORTO-COVERAGE-02`). Policy v1.2's
  `DETERMINISTIC_CONTEXT` basis requires **two or more retained pieces of
  first-party context mechanically combined to exactly one result** — here
  there is only ever one piece (day + month), never a second establishing
  the year, so the basis genuinely does not apply; it was not merely left
  unused.

## Escalation ladder actually followed

| Level | Method | Outcome | Why |
|---|---|---|---|
| 1 | `PASSIVE_STATIC` | `INSUFFICIENT` | Real static event cards exist, but no per-card category tag and no year anywhere; the advertised RSS feed is unrelated (sitewide news, not `eventos`). |
| 2 | `STRUCTURAL` | `SUFFICIENT` | The theme's public JS bundle revealed a genuine, unauthenticated `admin-ajax.php` JSON endpoint that server-side filters by the source's own music taxonomy term — solves music isolation cleanly. Two detail pages sampled directly confirm the year gap is real and not an artefact of the card/summary view. |

Level 2's outcome was `SUFFICIENT`, so escalation stops there — no
browser/headless probing (Level 3+) was attempted or needed. A browser
session cannot make the source state a fact (the event year) it simply
never publishes anywhere; escalating further would not have helped.

## Field assessment summary

| Field | State | Basis | Notes |
|---|---|---|---|
| `title` | `PROVEN` | `DIRECT_SOURCE` | Stated directly on every card and every detail page. |
| `start_date` | `PARTIAL` | — | Day + month always stated; year never stated, never derivable. |
| `time` | `PARTIAL` | — | A `horário` field exists but is genuinely per-event-optional (present on one sampled event, absent on the other). |
| `end` | `NOT_PRESENT` | — | No distinct end field; ranges live inside the same year-less date-text string. |
| `venue_location` | `PROVEN` | `DIRECT_SOURCE` | A real, specific place name in a structured `local` field, sampled 2/2. |
| `source_record_id` | `PROVEN` | `DIRECT_SOURCE` | Permalink slug — the source's own canonical path; corroborated by a matching internal WordPress post id in two independent locations on the same page. |
| `event_url` | `PROVEN` | `DIRECT_SOURCE` | Direct permalink on every card. |
| `price` | `PARTIAL` | — | An `entrada` field exists (free-text, e.g. `"livre"` or `"12€"`), sampled 2/2, but not verified across the full corpus. |

## Decision

**`DEFER`.** Not an access problem — `robots.txt` allows unrestricted
crawling, no authentication, CAPTCHA, or session requirement was touched
anywhere, and a clean, public, mechanically music-filterable JSON
acquisition path genuinely exists. The blocker is that the source itself
never states a year for any event, anywhere, and this project will not
invent one — see `docs/SOURCE_INVESTIGATION_POLICY.md`'s date/time rule
and `CLAUDE.md`'s "Unknown facts must never be invented." If the source
ever begins stating a year (a season/edition heading, a JSON-LD block, a
dated document elsewhere on the detail page, etc.), a **new** investigation
should be opened with `supersedes: "cm-gondomar-agenda-01"` rather than
editing this record in place.

## Evidence

All evidence is retained under `evidence/` and cited by `evidence_id` from
`investigation.json` — HTTP response bodies and headers for every fetch
(index page, JS bundle, two AJAX POSTs, two detail pages, RSS feed,
`robots.txt`), plus `evidence/offline-proof.mjs` /
`evidence/offline-proof-output.txt`, a small, dependency-free, no-network
script proving the parsing and the year-absence finding are reproducible,
not asserted. Every fetch was a real, live HTTP GET/POST against
`cm-gondomar.pt` on 2026-08-27 using `curl` — no browser automation was
used anywhere in this investigation.

## Validation

```
node ingestion/source-investigation/validate.mjs
```
