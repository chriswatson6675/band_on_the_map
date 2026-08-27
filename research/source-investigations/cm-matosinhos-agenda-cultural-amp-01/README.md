# Investigation: cm-matosinhos-agenda-cultural-amp-01

Explanatory only — `investigation.json` is authoritative; this file carries
no independent authority and is not read by the validator.

## Candidate

Registry entry: `sources/porto.json` → `cm-matosinhos-agenda-cultural-amp`
(Câmara Municipal de Matosinhos — Agenda Cultural da AMP), with
`official_website: "https://www.cm-matosinhos.pt"` and
`events_url: "https://www.cm-matosinhos.pt/servicos/cultura/agenda-cultural-da-amp"`.
That entry's existing `lifecycle_status` is `DISCOVERED`, `monitoring_status`
`NEEDS_TECHNICAL_REVIEW`, and its own `overlap_notes` already flagged the
naming-caution risk this task also raised: "Covers the whole Área
Metropolitana do Porto (AMP), not just Matosinhos". This investigation does
not edit that registry entry — see "What this investigation found" below
for why a future, separate registry-correction step is recommended.

## What this investigation found

**1. The registry's given `events_url` is a dead end.** A plain GET of
`https://www.cm-matosinhos.pt/servicos/cultura/agenda-cultural-da-amp`
retrieves a genuinely server-rendered CM Matosinhos page — but it is a
static informational article, not an events listing. Its own text explains
that "Agenda Cultural da AMP" ("iPorto") is a *Junta Metropolitana do Porto*
initiative spanning the 16 municipalities of the AMP, published quarterly,
and points readers to a separate portal, `http://iporto.amp.pt`, for the
actual programme. See `evidence/body-agenda.html`.

**2. The naming-caution is real, and independently confirmed.**
`iporto.amp.pt` is a WordPress site with a public REST API
(`/wp-json/wp/v2/event`). Its own `counties` taxonomy has 18 terms — the 16
real AMP municipalities plus an `amp`-wide catch-all — proving this really
is a multi-municipality aggregator, not a Matosinhos-specific feed. Its
`categories` taxonomy includes `Música` (id 36). Filtering
`categories=36&counties=45` (Matosinhos) returns 252 historical
music-in-Matosinhos records — real, but operated by a third party (Área
Metropolitana do Porto), not by CM Matosinhos itself. Per this project's
third-party-source rule, that portal was **not** adopted as this
candidate's own acquisition authority. See
`evidence/body-wpjson-counties.json`, `evidence/body-wpjson-categories.json`,
`evidence/body-wpjson-event-musica-matosinhos.json`.

**3. The real path: CM Matosinhos has its own, separate, native event
system.** One sampled `iporto.amp.pt` event page
(`evidence/body-event-page.html`) contained a "Mais informação" link back to
`https://www.cm-matosinhos.pt/evento/{slug}`. Following it
(`evidence/body-cmmatosinhos-evento.html`) revealed CM Matosinhos' own
domain independently hosts a first-party `EventDetail` widget for the same
event, with a structured add-to-calendar microformat
(`atc_date_start`/`atc_date_end`/`atc_timezone`/`atc_location`/`atc_title`),
a native category taxonomy including `Eventos | Música`, and a native
venue/location taxonomy restricted entirely to genuine Matosinhos venues
(confirmed from the `EventSearchForm` widget's own `<select>` options —
Teatro Municipal Constantino Nery, Casa da Música, Mercado Municipal de
Matosinhos, Marginal de Matosinhos, Praia de Matosinhos, etc.). From there,
the site's own left-nav led to a clean, bookmarkable, **plain-GET**,
paginated, already-category-filtered listing:
`https://www.cm-matosinhos.pt/servicos/comunicacao-e-imagem/eventos/musica`
(31 pages at review time) — the recommended acquisition path, requiring no
session, cookie, or CSRF token to read.

**4. Field quality is high.** Every sampled event states its title, a
fully-qualified `YYYY/MM/DD` date, a local time + explicit IANA timezone
(`Europe/Lisbon`), a venue, and a canonical permalink directly — no
contextual derivation was needed anywhere in this record; every `PROVEN`
field carries `basis: "DIRECT_SOURCE"`. Two independently sampled detail
pages (a single-instant event and a genuine multi-day event) proved
`atc_date_end` is a real, separately-stated source fact, not copied from
`atc_date_start`. `price` has no dedicated field and stays honestly
`PARTIAL` (present as free text for one sample, absent for the other).

**5. Roughly how many genuine Matosinhos music events exist right now?**
A bounded, confirmatory POST to the site's own `EventSearchForm` with
`category_id=34` ("Eventos | Música") and `start_date=2026/08/27` (today)
returned exactly **14** current/future events, all at genuine Matosinhos
venues (Teatro Municipal Constantino Nery, Praia do Cabo do Mundo/Perafita,
Mosteiro de Leça do Balio, São Mamede de Infesta, Praia de Matosinhos,
Largo da Viscondessa, Custóias) — see `evidence/body-post-musica-future.html`.
The recommended plain-GET listing's own page 1 (10 dated items, all
`>= 2026-08-27`) and page 2 (dates dropping to `2026-08-01`–`2026-08-16`,
confirming the page-1/page-2 boundary is genuinely "now") corroborate the
same figure independently. The full category-filtered archive spans 31
pages (~300+ records across the site's history, not just upcoming events).

## Probe history

A single Level 1 (`PASSIVE_STATIC`) pass, `SUFFICIENT` — no escalation was
needed. Every step (reading server-rendered HTML, a WordPress `Link`
response header, a public `<form>`'s own field names, a site's own left-nav
links, and submitting that form's own fields via a plain POST using only
the cookies/token its own public GET response issued) stayed within plain,
unauthenticated HTTP — no JS bundle inspection, no browser/headless session,
no private/undocumented endpoint, no login.

## Offline proof

`evidence/offline-proof.mjs` re-parses the retained fixtures only (no
network) and mechanically reproduces every `field_assessment` claim in
`investigation.json` — run via `node evidence/offline-proof.mjs`; captured
output in `evidence/offline-proof-output.txt` (`OFFLINE PROOF: PASSED`).

## Decision

`READY_FOR_ACTIVATION` — see `investigation.json`'s `decision.reasons` for
the full gate-by-gate justification. This is a research conclusion only: it
does not edit `sources/porto.json`, and does not build a collector. Turning
this into an active source requires two separate, explicitly-authorised
follow-up steps this investigation deliberately does not take:

1. **Correct the registry's `events_url`** from the dead-end
   `.../servicos/cultura/agenda-cultural-da-amp` to the genuine path this
   investigation found,
   `https://www.cm-matosinhos.pt/servicos/comunicacao-e-imagem/eventos/musica`
   (or an equivalent canonical form of it).
2. **Build a collector** (family: `STATIC_EVENT_LIST`, matching the
   `cm-gaia-eventos`/`cm-odivelas-agenda-cultura` precedent already in
   `ingestion/lisbon-porto/run.mjs`) that paginates the category-filtered
   listing, resolves each detail page's add-to-calendar microformat for
   `start`/`end`/`time`/`timezone`, and applies this project's existing
   date-bounding logic — none of which this investigation performs.
