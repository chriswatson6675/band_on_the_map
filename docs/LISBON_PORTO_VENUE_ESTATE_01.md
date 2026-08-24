# Lisbon/Porto Venue Estate — Broad Discovery Sweep (LISBON-PORTO-VENUE-ESTATE-01)

Task: LISBON-PORTO-VENUE-ESTATE-01
Date: 2026-08-24
Branch: `work/lisbon-porto-venue-estate-01`

## 1. Purpose

Prior research in this repository (`BOTM-RESEARCH-LISBON-SOURCES-01`,
`BOTM-RESEARCH-PORTO-SOURCES-01`, `PORTO-COVERAGE-02`) was **source-first**:
"does this event feed exist, and can we acquire it?" This package is
**venue-first**: "how many real live-music venues exist across Lisboa,
Porto, and the immediately-adjacent municipalities this project already
treats as in scope — regardless of whether an event feed for them has been
built yet?"

Before this package, `venues/lisbon.json` + `venues/porto.json` held **11**
canonical venues. That number was never claimed to be the real venue
estate — it was "every venue actually referenced by a proven Observation."
This package asked the separate, broader question directly.

## 2. Methodology

1. Read `venues/lisbon.json`, `venues/porto.json`, `sources/lisbon.json`,
   `sources/porto.json`, and `ingestion/venue-onboarding/` first, so
   already-known venues/sources were not rediscovered as if new.
2. Ran dozens of WebSearch queries across the neighbourhoods, genres, and
   venue categories named in this task's brief, in both Portuguese and
   English: jazz clubs, rock/indie venues, electronic clubs, fado houses,
   cultural centres, municipal auditoria, university venues, arenas, and
   small independent bars, across Alfama, Bairro Alto, Cais do Sodré,
   Graça, Anjos, Arroios, Intendente, Marvila/Beato, Alvalade, Ajuda
   (Lisboa) and Cedofeita, Baixa, Ribeira, Boavista, Bonfim, Foz, Gaia
   (Porto/Greater Porto).
3. Followed up promising candidates with direct `WebFetch` requests against
   each venue's own official first-party page (homepage, contacts page, or
   agenda page) wherever one could be found — never treating a third-party
   listicle as canonical address/identity authority, only as a discovery
   lead.
4. Compared every candidate against `venues/lisbon.json` /
   `venues/porto.json` (canonical) and `sources/lisbon.json` /
   `sources/porto.json` (already-researched sources not yet promoted to a
   canonical Venue) to avoid double-counting.
5. Retained every candidate — evidenced or not — as a research record, with
   an honest classification, rather than silently dropping weak leads.
6. Admitted a bounded subset of the strongest candidates as new canonical
   `ADDRESS_ONLY` venues via the existing `ingestion/venue/contract.mjs`
   contract (never a new admission mechanism), reusing exactly the same
   evidence model (`OFFICIAL_VENUE_WEBSITE` / `OFFICIAL_MUNICIPAL_CULTURAL_PAGE`
   evidence entries) as `venues/lisbon.json`/`venues/porto.json` already use.
7. Regenerated the manual-coordinate queue and ran the full validation loop.

Search depth stopped when: most new search formulations began returning
venues already found; the neighbourhood/genre list in this task's brief was
fully covered; official municipal/cultural portals had been checked; and
several map/blog-tier leads in a row produced no first-party evidence
beyond what a Facebook page or aggregator listing could confirm.

## 3. Discovery channels used

- Broad and neighbourhood-scoped WebSearch (English + Portuguese) across
  jazz, rock/indie, electronic, fado, classical/cultural-centre, and
  "música ao vivo" queries.
- Third-party discovery-only listicles/directories (Time Out, Wanderlog,
  Songkick, Resident Advisor, Viral Agenda, NoCartaz, Agenda Cultural do
  Porto, agenda-porto.pt, cartazculturallisboa.pt) — used only to *find*
  candidates, never as address/identity authority.
- Direct `WebFetch` of each candidate's own official site where one could
  be located (see the `evidence_urls` field of every
  `NEW_HIGH_CONFIDENCE`/`EXISTING_CANONICAL` entry in the research
  dataset).
- Cross-checking against this repository's own already-governed
  `sources/lisbon.json` / `sources/porto.json` P1/P2 entries, many of which
  are real, well-evidenced venues that had never been promoted to a
  canonical `Venue` record.

## 4. Research dataset

- `research/venue-estate/lisbon-porto-venue-estate-01.json` — 69 venue
  candidates, one object per venue, each carrying a `classification`
  (`EXISTING_CANONICAL` / `NEW_HIGH_CONFIDENCE` / `NEW_NEEDS_REVIEW` /
  `DUPLICATE_OR_ALIAS`), evidence URLs, address text (never invented),
  current-event status/count, and acquisition feasibility.
- `research/venue-estate/lisbon-porto-event-evidence-01.json` — 45 manually
  researched event records (venue, title, raw date text, parsed date only
  where the raw text was genuinely unambiguous, source/event URLs,
  retrieval timestamp, evidence type/confidence). These are **research
  records**, not automated-collector Observations — never presented as
  such.

## 5. Candidate totals

| | Lisbon-area (Lisboa + Odivelas) | Porto-area (Porto + Gaia, Póvoa, Espinho, Maia) | Total |
|---|---|---|---|
| Candidates researched | 41 | 28 | **69** |
| `EXISTING_CANONICAL` | 8 | 3 | 11 |
| `NEW_HIGH_CONFIDENCE` | 21 | 12 | 33 |
| `NEW_NEEDS_REVIEW` | 16 | 8 | 24 |
| `DUPLICATE_OR_ALIAS` | 1 | 0 | 1 |
| `CLOSED_OR_INACTIVE` | 0 | 0 | 0 |

No closures were discovered this package — every candidate researched
appears to be currently operating (or, for `UNCERTAIN` entries, simply
not re-verified as either open or closed within this bounded search).

## 6. Canonical admission this package

12 of the 33 `NEW_HIGH_CONFIDENCE` candidates had strong enough,
independently-fetched first-party evidence (an official page directly
stating the venue's own address) to admit as new canonical `Venue` records
— all `ADDRESS_ONLY` (never `CONFIRMED`/`GEOCODED`; coordinate research
stays closed per `docs/VENUE_COORDINATE_RESEARCH_CLOSED.md`):

**Lisbon (9):** Hot Clube de Portugal, Galeria Zé dos Bois (ZDB), Fama
d'Alfama, Museu do Fado, Casa Independente, Clube de Fado, Teatro São Luiz,
Centro Cultural de Belém (CCB), Aula Magna (Reitoria da Universidade de
Lisboa).

**Porto (3):** Hot Five Jazz & Blues Club, Capela Incomum, Super Bock
Arena — Pavilhão Rosa Mota.

Canonical venue count: **11 → 23** (17 Lisbon-area, 6 Porto-area).

The remaining 21 `NEW_HIGH_CONFIDENCE` candidates (e.g. Coliseu dos
Recreios, Campo Pequeno, Fundação Calouste Gulbenkian, MusicBox, Lux
Frágil, RCA Club, LAV, Hard Club, Maus Hábitos, Coliseu Porto Ageas,
Serralves, M.Ou.Co, Casa das Artes do Porto, Rua Tapas & Music, and others)
were **not** admitted this package — each either lacked an independently
fetched first-party address confirmation within this session's bounded
search, or is already a `sources/*.json` entry whose address was recorded
in a prior session and not independently re-verified here. Left as
research evidence for a future admission pass, per this task's "do not
force admission merely to raise the count" rule.

`Teatro Variedades & Capitólio` is a genuine `DUPLICATE_OR_ALIAS` — the
same physical building as the pre-existing canonical Cineteatro Capitólio,
already mapped via `venues/source-venue-mappings.json`. Not counted as a
new venue.

## 7. Current/future events found

Primary window: 2026-08-24 through 2026-12-31 (a few venues' own pages
exposed genuinely available dates beyond this window — retained honestly,
not discarded).

| | Lisbon-area | Porto-area | Total |
|---|---|---|---|
| Venues classified `ACTIVE_WITH_CURRENT_EVENTS` | 12 | 6 | 18 |
| ...of which have ≥1 captured, dated event record | 6 | 4 | **10** |
| Event evidence records captured | 27 | 18 | **45** |

(The gap between 18 and 10 is real recurring/known-active programming —
e.g. Lux Frágil's own "45 upcoming concerts" per Songkick, or Lisboa em
Fado's daily 6pm/7:30pm shows — where this package could confirm the venue
is currently programming music but did not capture individual dated event
records within its bounded search; never conflated with the venues that
have actual retained event evidence.)

Breakdown by venue (event evidence record count):

- Hot Clube de Portugal — 9 (8 Lisbon-region + 1 out-of-region Braga
  reference, retained honestly, excluded from Lisbon totals)
- RCA Club — 13 (month-only dates; `AMBIGUOUS_DATE`, day never invented)
- LAV – Lisboa ao Vivo — 4 (full date + time)
- Teatro São Luiz — 1 (Picadeiro Fest, date range)
- Super Bock Arena — 11 (full dates; 2 of these fall in Jan/Apr 2027,
  retained as genuinely available future-period evidence)
- Hot Five Jazz & Blues Club — 3 (year inferred from retrieval context,
  flagged)
- Hard Club — 3 (`AI_SUMMARIZED_FETCH_UNVERIFIED`, low confidence — see
  §9)
- Casa das Artes do Porto — 1 (year genuinely absent from the source page)

Most `NEW_HIGH_CONFIDENCE`/`EXISTING_CANONICAL` venues are
`ACTIVE_NO_CURRENT_EVENTS_FOUND` (a real, active venue whose current
calendar was not independently re-fetched this session — most of the
pre-existing canonical venues fall here, since this package's own new
research effort was concentrated on newly discovered venues) or
`MUSIC_VENUE_NO_CALENDAR_FOUND`.

## 8. Venue types and genres

Across the 69 candidates: `MULTI_GENRE`/`CULTURAL_PROGRAMME` venues are
the largest single group (cultural centres, municipal auditoria, arenas),
followed by `JAZZ` (Hot Clube de Portugal, Távola Jazz Club, Hot Five Jazz
& Blues Club, Mr. Bean's Music Club, Mirajazz), `FADO` (Fama d'Alfama,
Museu do Fado, Clube de Fado, Lisboa em Fado, Fado e Fado, Capela
Incomum), `ELECTRONIC` (MusicBox, Lux Frágil, Ministerium Club, KØMPLEX,
NĀDA Temple), and `ROCK_INDIE` (RCA Club, Barracuda, Indie Rock Café,
Valhalla, Damas).

## 9. Acquisition feasibility

| Feasibility | Count |
|---|---|
| `READY_EXISTING_COLLECTOR` (pre-existing canonical venues, already technically proven) | 11 |
| `STATIC_HTML` | 14 |
| `CLIENT_RENDERED` | 7 |
| `SOCIAL_ONLY` | 20 |
| `NO_EVENT_CALENDAR` | 7 |
| `AMBIGUOUS_DATE` | 2 (RCA Club, Hard Club) |
| `OTHER` | 8 |

**Hard Club note:** `sources/porto.json`'s own `hard-club-porto` entry
already documents in detail (across two prior sessions) that this venue's
public agenda fragment exposes day-of-month but not a reliable month, and
is deliberately deferred (`NEEDS_TECHNICAL_REVIEW`). This package's own
`WebFetch` (which summarizes a page through a small model rather than
returning literal raw text) surfaced apparent full `"Month DD, YYYY"`
dates on a re-fetch of the same page. Per this task's "never fabricate a
date" rule, these are retained in the event-evidence file honestly flagged
`AI_SUMMARIZED_FETCH_UNVERIFIED` / low confidence, **not** promoted to a
trusted parsed date, and the existing, more rigorously investigated
`sources/porto.json` finding (deferred, `AMBIGUOUS_DATE`) remains
authoritative for automation purposes.

## 10. P1/P2/P3 source backlog (next easy sources)

**P1 — high yield, first-party calendar exists, worth automating next:**

- **Super Bock Arena** — server-rendered `STATIC_HTML` agenda with real
  dated events through 2027; largest new-discovery venue this package.
- **LAV – Lisboa ao Vivo** — dedicated `/agenda/` page with real dated,
  timed events; likely `STABLE_EVENT_PAGE`-family, similar to MEO Arena's
  proven pattern.
- **Hot Five Jazz & Blues Club** — real dated events on the homepage
  itself (Thu-Sun cadence); small, bounded venue, likely a quick
  `STATIC_HTML` adapter.
- **Hot Clube de Portugal (own venue events only)** — already a
  `TECHNICAL_PATH_PROVEN` P1 source (`ICS_CALENDAR`, see
  `docs/sources/HOT_CLUBE.md`); this package only newly gave it a
  canonical `Venue` record — no acquisition work needed, purely a
  resolution/mapping opportunity now that the venue exists.

**P2 — real venue, useful, but lower yield or moderately harder acquisition:**

- **RCA Club** — real, dated (month-only) event listing; would need either
  a day-of-month source or an explicit `AMBIGUOUS_DATE` policy decision
  before automation.
- **Teatro São Luiz** — static programme pages exist; moderate yield
  (co-produces jazz festivals rather than nightly programming).
- **Coliseu dos Recreios**, **Campo Pequeno** — already P1 `sources.json`
  entries; Coliseu is bot-protected (403), Campo Pequeno's address is too
  imprecise for admission but its agenda page is plain HTML.
- **Fundação Calouste Gulbenkian** — major, well-documented classical/jazz
  season; this session's own contacts-page fetch was blocked (403), a
  genuine gap worth a dedicated technical pass.
- **M.Ou.Co**, **Casa das Artes do Porto**, **Rua Tapas & Music** — real,
  evidenced Porto venues with apparent static listings, not yet
  independently fetch-verified this session.

**P3 — real venue, poor/no machine-readable calendar, or SOCIAL_ONLY:**

MusicBox, Lux Frágil, Ministerium Club, KØMPLEX, NĀDA Temple, Damas,
Incognito, Indie Rock Café, Club Noir, Titanic Sur Mer, Alface Hall,
Valhalla, Tokyo Bar, Disgraça, Távola Jazz Club, Barracuda, Ferro Bar,
Embaixada do Porto, Mr. Bean's Music Club, Mirajazz, Ryan's Irish Pub, Casa
do Livro, Auditório Francisco de Assis — all `SOCIAL_ONLY` or otherwise
without a confirmed first-party calendar within this package's bounded
search.

**Client-rendered / headless-required:** Maus Hábitos, Coliseu Porto
Ageas, Serralves, Casa das Artes do Porto (partially), MusicBox, Lux
Frágil — all confirmed JS-rendered shells this session, matching prior
`sources/porto.json` findings for the same platform family
(`bond-frontend`) where applicable.

## 11. Closed/inactive discoveries

None. Every venue candidate researched this package appears to be
currently operating, based on available evidence. No venue was found and
then excluded on closure grounds.

## 12. Limitations

- This is still a **bounded** sweep, not exhaustive. Diminishing returns
  were reached (repeated search formulations surfacing already-known
  venues), but real Lisbon/Porto live-music venues certainly remain
  undiscovered — particularly SOCIAL_ONLY bars with no searchable web
  footprint at all.
- Several strong candidates (Gulbenkian, MusicBox, Lux Frágil, RCA Club,
  M.Ou.Co, Casa das Artes) were **not** admitted to canonical status this
  package purely because this session's own direct fetch could not
  independently confirm a first-party address (blocked, client-rendered,
  or DNS-failed) — not because the venues themselves are doubtful. A
  future session with better fetch access could likely admit several of
  these quickly.
- `Hard Club`'s three event records are explicitly low-confidence
  (`AI_SUMMARIZED_FETCH_UNVERIFIED`) and should not be treated as
  equivalent evidence to a directly-read HTML fetch — see §9.
- `RCA Club`'s 13 events are month-only; no day-of-month was retained
  anywhere, so none of them are usable for a real calendar entry without
  further source work.
- Naming ambiguity: "Embaixada do Porto" vs "Embaixada Bar Porto" could
  not be confidently disambiguated as the same or different venues within
  this session — recorded once, flagged, not resolved.
- The known-address discrepancy between Hot Five Jazz & Blues Club's own
  official page and an earlier secondary listing, and between TNSC's own
  page (bilheteira relocation) and its long-standing recorded main-building
  address, are both recorded honestly rather than silently reconciled.

## 13. Files

- `research/venue-estate/lisbon-porto-venue-estate-01.json`
- `research/venue-estate/lisbon-porto-event-evidence-01.json`
- `venues/lisbon.json`, `venues/porto.json` (12 new `ADDRESS_ONLY` venues)
- `fixtures/geocoding/manual-coordinate-queue.json` (regenerated: 6 → 18 entries)
- `tests/venue-estate-01.test.mjs` (new)
- `tests/porto-venues.test.mjs`, `tests/manual-coordinate-queue.test.mjs` (updated expectations)
