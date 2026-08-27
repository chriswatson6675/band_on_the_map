# cm-sintra-agenda-cultural-01

Non-authoritative explanation for a human reader. **`investigation.json` is
the authoritative record** — this file never overrides it, and the
validator never reads this file. See `docs/SOURCE_INVESTIGATION_POLICY.md`
for the governing policy.

## What was investigated

**Câmara Municipal de Sintra — Agenda Cultural**, the Sintra municipality's
own public cultural-events calendar (`https://cm-sintra.pt/agenda`), which
covers events across many venues/spaces in the municipality (Centro
Cultural Olga Cadaval, MU.SA, Museu Arqueológico de São Miguel de
Odrinhas, the municipal libraries, Casa da Cultura Lívio de Morais, and
others) — not a single physical venue. A registry entry already existed
(`sources/lisbon.json`, id `cm-sintra-agenda-cultural`) with
`official_website: "https://cm-sintra.pt"` and
`events_url: "https://cm-sintra.pt/agenda"`, `monitoring_status:
"NEEDS_TECHNICAL_REVIEW"`, and a loose note ("Dated entries with an
interactive month-calendar UI; no RSS or JSON-LD found"). This
investigation treated that note as a lead only and independently
re-verified everything itself against freshly retained evidence — no
`sources/*.json`, `venues/*.json`, `venues/manual-coordinates.json`, or
`data/public/*` file was touched.

## What was found

The candidate events page is a fully server-rendered **Joomla** site
running the **iCagenda** (`com_icagenda`) events-calendar extension — the
**same platform family already identified for the sibling investigation
`cco-sintra-01`** (Centro Cultural Olga Cadaval), but `cm-sintra.pt` is a
genuinely distinct domain/install, independently re-confirmed here rather
than assumed. At fetch time the current, unfiltered listing held **exactly
18 upcoming/ongoing events across 2 list pages** (page 1: 10 rows, page 2:
8 rows — no further pagination link exists), spanning **6 distinct
first-party categories**: Exposições, Bibliotecas, Teatro, Visitas
Guiadas, Música, and Outros.

**The central finding this task asked for**: the source exposes a genuine,
*mechanical* way to isolate real music events from the rest of the civic
calendar — not AI classification. Every event row carries its own
first-party category label (e.g. `Música`) as both a visible link and a
working server-side query parameter (`?filter_category=3`). This
investigation proved the filter is genuinely functional, not decorative,
by independently tallying the raw unfiltered 18-row listing's own category
breakdown and cross-checking it record-for-record against the source's own
`?filter_from=<today>&filter_category=3` query result — an **exact
match**: 3 upcoming Música-tagged occurrences (2 distinct productions:
"Evita no Olga Cadaval", 2 dates, and "Noites de Orfeu", 1 date).

All 3 sampled music rows directly state their own title, full ISO date,
start time, venue, and permalink — no page-heading/context combination was
needed anywhere (`DIRECT_SOURCE` throughout). The same
**stable-identifier-rule nuance already discovered on `cco-sintra-01`**
recurs here, independently re-confirmed rather than assumed: this
platform's internal numeric event id (visible only in an HTML class
attribute, never in any URL) is **not** unique per occurrence — id `148`
("Evita") is shared by two different dates in the retained sample. Unlike
`cco-sintra-01`, this site's public permalinks carry no numeric id at all
and this platform emits **no `<link rel="canonical">`**; the functional
equivalent is each detail page's own `<meta property="og:url">`, which
this investigation confirmed self-matches the fetched URL for both
retained detail pages (2/2).

Two further honest, non-blocking findings:

- **`end`/duration is genuinely `NOT_PRESENT`** in the bounded 2-page
  detail-page sample (differs from `cco-sintra-01`, where a free-text
  duration sentence existed on some pages — this investigation did not
  assume the same pattern recurs merely because the platform matches).
- **Price is inconsistent, unstructured text**, and a naive whole-page
  `"gratuit*"` search would be actively *wrong*: the word "gratuita"
  appears on the ticketed "Evita" event's own page, but inside an
  *unrelated* footer news-slider item about a different venue's free
  exhibition, not about Evita's own price — mirroring the identical
  `"gratuito" = free parking, not free admission` pitfall already
  documented in `cco-sintra-01`.

The site's own advertised RSS route (`/agenda?format=feed&type=rss`) was
checked and found genuinely disabled (`HTTP 410 Gone`) — the same finding
already established for `cco-sintra-01` on this platform family. No
JSON-LD `Event`/`MusicEvent` data exists anywhere on this source; the one
`application/ld+json` block present is a generic `BreadcrumbList`.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was used, and it was `SUFFICIENT` — the
entire retained sample (both unfiltered list pages, both filtered-query
variants, 2 event-detail pages, the RSS route, and robots.txt) was already
fully readable from plain, unauthenticated HTTP responses. No escalation
to Level 2/3/4 was attempted or needed.

## Decision

**`READY_FOR_ACTIVATION`.** All of the mechanically-enforced `v1.2`
activation gates in `docs/SOURCE_INVESTIGATION_POLICY.md` are met:
identity is `PROVEN`, the acquisition class (`KNOWN_CALENDAR_PLUGIN`) is a
resolved/supported class, four `data_paths` entries are evidenced (three
`PUBLIC`/`CONFIRMED`), `title` and `start_date` are both `PROVEN` with
basis `DIRECT_SOURCE`, `source_record_id` is `PROVEN` via the permalink
nuance described above, a known collector family (`STATIC_EVENT_LIST`) is
recommended, a `DETERMINISTIC_DERIVATION` evidence item exists (40/40
checks passed), and no blocker is `CRITICAL` (five `MINOR` blockers only —
see `investigation.json`'s `collector_assessment.blockers` for the full,
honest list, including a modest current yield of 3 upcoming music
occurrences and an unobserved date-range edge case).

This is a research conclusion only. Reaching `READY_FOR_ACTIVATION` here
does **not** edit `sources/*.json`, any `venues/*.json` registry, or any
other live registry — turning this into an active collector is a
separate, explicitly-authorised step outside this investigation's scope.

## Evidence

All evidence lives under `evidence/`:

- `body-home.html` / `headers-home.txt` — homepage (identity, platform
  fingerprints).
- `body-agenda.html` / `headers-agenda.txt` — the candidate agenda list
  page, page 1 of the current listing (10 event rows).
- `body-agenda-page2.html` / `headers-agenda-page2.txt` — the listing's
  final page (8 more event rows; no further pagination exists).
- `body-agenda-musica.html` / `headers-agenda-musica.txt` — the source's
  own `?filter_category=3` query with no date bound (10 rows, including
  past dates — shows `filter_category` alone is not date-bounded).
- `body-agenda-musica-upcoming.html` /
  `headers-agenda-musica-upcoming.txt` — the source's own combined
  `?filter_from=<today>&filter_category=3` query (exactly 3 rows, all
  upcoming, all Música) — the key proven data path.
- `body-event-evita.html` / `headers-event-evita.txt` — one music
  event-detail permalink (external ticketing link, unrelated
  "gratuita" footer text, `og:url` self-match).
- `body-event-orfeu.html` / `headers-event-orfeu.txt` — the second music
  event-detail permalink (genuine free-admission self-description,
  `og:url` self-match).
- `body-feed.xml` / `headers-feed.txt` — the site's own advertised RSS
  route (checked, `HTTP 410 Gone`).
- `body-robots.txt` / `headers-robots.txt` — robots.txt (no `/agenda`
  disallow; this investigation's small, bounded request count respects
  it).
- `offline-proof.mjs` — dependency-free, no-network Node script that
  re-parses the retained files above and mechanically re-derives every
  claim in `investigation.json`'s `field_assessment` and
  `site_classification`.
- `offline-proof-output.txt` — captured stdout of running that script
  (40/40 checks passed); cited in `investigation.json` as the
  `DETERMINISTIC_DERIVATION` evidence item.
