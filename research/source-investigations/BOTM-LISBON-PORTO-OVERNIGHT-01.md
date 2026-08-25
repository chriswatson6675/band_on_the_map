# Lisbon/Porto Overnight Venue Investigation (BOTM-LISBON-PORTO-OVERNIGHT-01)

Task: BOTM-LISBON-PORTO-OVERNIGHT-01
Branch: `work/lisbon-porto-overnight-investigation-01`
Date: 2026-08-25
Policy version used: `BOTM-SOURCE-INVESTIGATION-v1.1` (the version actually committed on
`origin/main` at the time of this run — see "Operating note" below)

## 1. Purpose

Autonomous overnight investigation-only run against the Lisbon/Porto venue backlog
identified in `docs/LISBON_PORTO_VENUE_ESTATE_01.md`, `sources/lisbon.json`, and
`sources/porto.json`. Ten venues were carried through a full governed source
investigation under `docs/SOURCE_INVESTIGATION_POLICY.md`. No source was activated,
no registry file was edited, and nothing was published — this package produces
investigation records and reusable acquisition-family findings only.

## 2. Operating note: shared working directory

This run started in the shared primary checkout (`C:\Users\chris\Dev\band_on_the_map`)
and discovered mid-run that a **different, unrelated, uncommitted task** was already
live there — modifications to `ingestion/source-investigation/contract.mjs` and
`tests/source-investigation-policy-version.test.mjs` adding not-yet-released policy
`v1.2` support (`BOTM-GIG-FACT-DERIVATION-GOVERNANCE-02`), plus an untracked
`research/source-investigations/example-deterministic-context-ready-01/` fixture —
none of it created by this run, none of it committed anywhere at the time. A
concurrent process was also actively switching branches in that same shared
directory during this run (confirmed via `git reflog`), which briefly caused one
checkpoint commit to land on the wrong branch. That commit was recovered
non-destructively (`git reset --soft`, no working-tree changes lost) and this run
then moved into its own isolated `git worktree`
(`C:\Users\chris\Dev\band_on_the_map-lisbon-porto-overnight-investigation-01`,
matching the repository's own existing worktree-per-branch convention) for all
subsequent work. **Every investigation in this package targets policy `v1.1`
explicitly** — the only version actually present on `origin/main` — and nothing
from the unrelated `v1.2` work was read, used, or committed by this package.

## 3. Method

1. Read `CLAUDE.md`, `docs/SOURCE_INVESTIGATION_POLICY.md`,
   `docs/ARCHITECTURE.md`, `docs/LISBON_PORTO_VENUE_ESTATE_01.md`,
   `sources/lisbon.json`, `sources/porto.json`, and the existing investigation
   directories (`gulbenkian-lisbon-01`, `hard-club-porto-01`,
   `maus-habitos-porto-01`) to establish current repository state before
   selecting targets.
2. Selected 10 venues (5 Lisbon, 5 Porto) from the existing venue-estate/source
   backlog that were credible live-music venues, not yet covered by an active
   successful source, had an apparent official web presence, and were not
   already the subject of a valid existing investigation. Hard Club and Maus
   Hábitos were deliberately excluded — both already carry a valid governed
   investigation on file; re-litigating either without new evidence was not
   warranted (see "Deferred / not re-investigated" below).
3. Ran each investigation as an independent, parallel background agent, each
   instructed to: read the policy itself in full, use `curl` (never `WebFetch`)
   for byte-faithful `DIRECT_EVIDENCE`, start at Level 1 (`PASSIVE_STATIC`) and
   escalate only when genuinely insufficient, write a dependency-free
   no-network `offline-proof.mjs` per source, and reach one honest decision.
4. Validated every record twice: once informally during the agent's own run,
   and again by this orchestrator directly, against the **canonical, unmodified**
   `ingestion/source-investigation/contract.mjs` in the isolated worktree (not
   the contaminated copy in the shared directory).
5. Committed in three checkpoints on the same branch (see §7).
6. Ran the full validation suite (`npm test`, `npm run
   validate:source-investigations`, `npm run lint`, `npm run build`) in the
   isolated worktree before finishing.

## 4. Investigations

### Lisbon

| Venue | Official URL | Probe levels | Acquisition class | Collector family | Sample | Decision |
|---|---|---|---|---|---|---|
| Teatro São Luiz | teatrosaoluiz.pt | 1 (SUFFICIENT) | STATIC_HTML | STATIC_EVENT_LIST | 26 cards, 5 detail pages | **HUMAN_REVIEW** |
| Centro Cultural de Belém (CCB) | ccb.pt | 1 (SUFFICIENT) | PUBLIC_JSON_API | JSON_API | 20/90 música-category events | **READY_FOR_ACTIVATION** |
| Fama d'Alfama | famadalfama.pt | 1 (SUFFICIENT) | STATIC_HTML | STATIC_EVENT_LIST | 31 nightly day-blocks (1 month) | **READY_FOR_ACTIVATION** |
| Casa Independente | casaindependente.com | 1 (SUFFICIENT) | STATIC_HTML | STATIC_EVENT_LIST | 4 current events | **READY_FOR_OFFLINE_PROOF** |
| Museu do Fado | museudofado.pt | 1 (SUFFICIENT) | STATIC_HTML | STATIC_EVENT_LIST | 7 events, 4 detail pages | **READY_FOR_ACTIVATION** |

### Porto

| Venue | Official URL | Probe levels | Acquisition class | Collector family | Sample | Decision |
|---|---|---|---|---|---|---|
| Hot Five Jazz & Blues Club | hotfive.pt | 1 (SUFFICIENT) | STATIC_HTML | STATIC_EVENT_LIST | 52 event cards | **READY_FOR_ACTIVATION** |
| Coliseu Porto Ageas | coliseu.pt | 1→2 (INSUFFICIENT→SUFFICIENT) | PUBLIC_JSON_API | JSON_API | 5 (of 72 total) via GraphQL | **READY_FOR_ACTIVATION** |
| M.Ou.Co | moucohotel.pt (unreachable) | 1 (BLOCKED) | UNKNOWN | none | 0 | **DEFER** |
| Casa das Artes do Porto | casadasartes.gov.pt | 1→2 (INSUFFICIENT→SUFFICIENT) | WORDPRESS | none | 0 (site stale ~22mo) | **DEFER** |
| Rua Tapas & Music | ruatapas.com | 1→2 (INSUFFICIENT→INSUFFICIENT) | CLIENT_RENDERED | none | 0 | **DEFER** |

### Primary blockers and reusable lessons, per source

- **Teatro São Luiz** — Blocker: source never states a calendar year anywhere,
  and the season spans a year boundary; an auxiliary JSON endpoint is
  proven unreliable/incomplete (one event present there is absent from the
  static listing). Lesson: a stable WordPress `Link: rel=shortlink` header
  is a reliable id even with no numeric id in the page body — same pattern
  already used by `docs/sources/CAPITOLIO.md`.
- **CCB** — No blocker (MAJOR only: a reproducible 302-redirect bug on one
  recurring event's first-occurrence permalink; the REST id is unaffected).
  Lesson: **The Events Calendar Pro's REST API** (`/wp-json/tribe/events/v1/`)
  is a reusable `JSON_API` family already proven at Super Bock Arena/LAV via
  HTML scraping — CCB shows the same plugin exposes a first-party REST route
  directly, a materially cleaner acquisition path than scraping its HTML.
- **Fama d'Alfama** — No blocker. Lesson: nightly-residency fado venues
  publish one full calendar month per static page; mechanically verified via
  real Gregorian weekday-arithmetic cross-check against the source's own
  weekday labels (not "today"-based inference).
- **Casa Independente** — Blocker (2×MAJOR): no per-event id/URL exists at
  all on the source, and the year-inference approach was validated against
  only one month's page state. Lesson: hand-authored Elementor event pages
  (no calendar plugin) are a real, recurring pattern in this venue tier —
  distinct from `STATIC_EVENT_LIST` sources that at least have a permalink.
- **Museu do Fado** — No blocker (5×MINOR). Lesson: same EGEAC-adjacent
  municipal-cultural-centre pattern as CCB/Teatro São Luiz, but with the
  weakest identifier evidence of the three (slug stability observed only
  once) — future work should re-observe ≥24h apart before treating
  `source_record_id` as fully proven.
- **Hot Five Jazz & Blues Club** — Blocker (1×MAJOR): no calendar year
  anywhere in first-party evidence; a linked third-party ticketing page
  states the year but was correctly NOT used to promote the field (per the
  policy's third-party-sources rule). Lesson: small independent venues in
  this cohort recurrently omit the year — worth a dedicated cross-source
  year-inference policy decision rather than solving per-venue.
- **Coliseu Porto Ageas** — No blocker (4×MINOR). Lesson: **the single most
  valuable new finding this batch** — a client-rendered React SPA with an
  empty root div can still expose a real public, CORS-open, introspectable
  GraphQL API discoverable from a plain `env-config.js` the app itself
  loads. This directly supersedes the older `sources/porto.json` note (which
  stopped at Level 1 and assumed a headless collector was required) without
  ever needing to open a browser. Worth checking every other `CLIENT_RENDERED`
  finding in this repo's backlog (Maus Hábitos, Serralves, Coliseu dos
  Recreios, agenda-vila-do-conde) for the same `env-config.js`/bootstrap-JSON
  pattern before assuming any of them needs `HEADLESS_REQUIRED`.
- **M.Ou.Co** — Blocker (1×CRITICAL): current DNS unreachability of every
  known domain form, corroborated by an independent DoH resolver (not a
  local network fluke). Historical Wayback evidence additionally shows an
  Imunify360 anti-bot/anti-headless challenge already in place before the
  domain went dark. Lesson: DNS failure is a legitimate, low-cost Level-1
  `BLOCKED` outcome — no need to escalate further to prove a dead domain is
  dead.
- **Casa das Artes do Porto** — Blocker (1×CRITICAL): the site is real and
  technically accessible (plain WordPress, REST API enumerable) but has
  published only 3 posts ever, ~22 months stale. Lesson: `WORDPRESS`
  classification with a working REST API is not itself sufficient for
  activation — content *currency* is a separate, equally necessary check,
  and this repo's `WORDPRESS_CALENDAR` family assumption should not be
  applied blindly just because the CMS matches.
- **Rua Tapas & Music** — Blocker (1×MAJOR, no CRITICAL): a genuine Wix
  "Events & Tickets" app page exists at `/agenda` but exposes zero
  structured data statically; the venue's own sitemap excludes `/agenda`
  and `/events` entirely. Lesson: Wix sites are a recognisable, recurring
  `CLIENT_RENDERED` family in this cohort (a real `LocalBusiness` JSON-LD on
  the homepage but nothing on the events page) — worth documenting as its
  own sub-pattern distinct from the `bond-frontend` platform already
  identified for Maus Hábitos/Serralves/agenda-vila-do-conde.

## 5. Deferred / not re-investigated this package

- **Hard Club (Porto)** — not re-investigated this package because a valid
  existing governed investigation (`hard-club-porto-01`) already exists.
  That investigation escalated the full ladder and established: a
  non-browser, two-step session-bootstrap → AJAX acquisition path (a plain
  prior GET of the agenda page to establish a session cookie, then the same
  first-party AJAX endpoint returns full day+month text for every event);
  DAY and MONTH are reliably obtainable this way; the CALENDAR YEAR is the
  one field the source never states in any structural response; and the
  decision is **`HUMAN_REVIEW`**, not `DEFER` — the record is explicit that
  `HUMAN_REVIEW` (rather than `DEFER`) was chosen because the acquisition
  mechanism itself is strong and reproducible, and the remaining gap is a
  deliberate year-resolution policy call, not a technical or access
  blocker. No new evidence surfaced tonight that would justify opening a
  new investigation; the separate gig-fact/context-derivation governance
  work in progress elsewhere in this repository may later justify a new,
  explicitly-superseding Hard Club investigation once a year-resolution
  strategy exists, but this overnight batch correctly left the existing
  historical record untouched rather than rewriting it.
- **Maus Hábitos (Porto)** — existing `maus-habitos-porto-01` investigation
  already documents a `bond-frontend` client-rendered platform with no
  discoverable JSON endpoint. Given tonight's Coliseu Porto Ageas finding
  (a `CLIENT_RENDERED` SPA can still expose a public API via bootstrap
  config), Maus Hábitos is now the single **most promising re-check
  candidate** for a future, explicitly-superseding investigation — but that
  is new work for a future package, not this one.
- Coliseu dos Recreios, Campo Pequeno, Gulbenkian's contacts-page discrepancy
  follow-up, RCA Club, MusicBox, Lux Frágil, Clube de Fado, Aula Magna,
  Barracuda, Ferro Bar — all remain research-only backlog entries per
  `docs/LISBON_PORTO_VENUE_ESTATE_01.md`/`sources/*.json`, not touched this
  package. Barracuda and Ferro Bar specifically have no known official
  website in existing research (`SOCIAL_ONLY`) and were deprioritised in
  favour of candidates with a real first-party site.

## 6. Reusable acquisition families confirmed or newly identified

- **JSON_API — WordPress "The Events Calendar Pro" REST namespace**
  (`/wp-json/tribe/events/v1/events`): already known via Super Bock Arena's
  HTML scraping; CCB proves the *same plugin* also exposes a clean REST
  route directly — a strictly better acquisition path when present. Worth
  checking every existing `KNOWN_CALENDAR_PLUGIN`/Events-Calendar source in
  this repo (Super Bock Arena, LAV) for the same REST route before assuming
  HTML scraping is the only option.
- **JSON_API — bootstrap-config-exposed GraphQL/REST endpoint on a
  client-rendered SPA** (Coliseu Porto Ageas): a new, generalisable pattern
  — "client-rendered shell + public `env-config.js`/bootstrap JSON revealing
  the app's own real API base URL" — worth formalising as its own checklist
  step in the Level 2 (STRUCTURAL) probe methodology for every
  `CLIENT_RENDERED` candidate, before defaulting to `HEADLESS_REQUIRED`.
- **STATIC_EVENT_LIST — hand-authored Elementor/WordPress page, no calendar
  plugin** (Casa Independente): a distinct, lower-reliability sub-pattern
  from `STATIC_EVENT_LIST` sources that use a real calendar plugin — no
  stable id/URL, format drift observed even within one small sample.
- **CLIENT_RENDERED — Wix "Events & Tickets" app** (Rua Tapas & Music): a
  new, distinct client-rendered sub-pattern from the already-known
  `bond-frontend` platform (Maus Hábitos/Serralves/agenda-vila-do-conde) —
  both currently unsupported, but worth telling apart if headless collector
  work is ever prioritised, since they are different vendor platforms.
- **DNS-dead / historically anti-bot-gated domain** (M.Ou.Co): confirms the
  existing `BLOCKED` Level-1 outcome is legitimate without needing to escalate
  further, and that Wayback Machine evidence is a legitimate, low-cost way to
  corroborate a live block with historical context.

## 7. Checkpoints

- Checkpoint 01 (`f83220e`): `casa-independente-lisbon-01`, `fama-dalfama-lisbon-01`.
- Checkpoint 02: committed once, discovered to have landed on the wrong
  branch due to a concurrent branch switch in the shared directory, and was
  recovered via `git reset --soft` (no data lost) rather than left in place —
  see §2. Its content (`mouco-porto-01`, `casa-das-artes-porto-01`) is folded
  into checkpoint 03 instead.
- Checkpoint 03 (`b5b11f2`): `museu-do-fado-lisbon-01`, `ccb-lisbon-01`,
  `coliseu-ageas-porto-01`, `hot-five-porto-01`, `mouco-porto-01`,
  `casa-das-artes-porto-01`, `rua-tapas-music-porto-01`,
  `teatro-sao-luiz-lisbon-01`.

## 8. Totals

- Venues attempted: **10**
- Venues investigated successfully (governed record completed and validated): **10**
- `READY_FOR_ACTIVATION`: **5** (CCB, Fama d'Alfama, Museu do Fado, Hot Five,
  Coliseu Porto Ageas)
- `READY_FOR_OFFLINE_PROOF`: **1** (Casa Independente)
- `HUMAN_REVIEW`: **1** (Teatro São Luiz)
- `DEFER`: **3** (M.Ou.Co, Casa das Artes do Porto, Rua Tapas & Music)
- `REJECT`: **0**
- Current/future gigs sampled across all retained evidence: **~140+** individual
  event/day records (26 Teatro São Luiz cards, 20 CCB events, 31 Fama
  d'Alfama day-blocks, 4 Casa Independente, 7 Museu do Fado, 52 Hot Five,
  5 Coliseu Porto Ageas) — exact per-source counts in §4.
- Existing collector families reused/confirmed: `STATIC_EVENT_LIST`,
  `JSON_API`
- New reusable acquisition capabilities discovered: bootstrap-config-exposed
  API on a client-rendered SPA (Coliseu Porto Ageas); Wix client-rendered
  sub-pattern (Rua Tapas & Music)
- Browser-observation (Level 3) investigations: **0**
- Level 4 investigations: **0**
- Blocked sites: **1** (M.Ou.Co, DNS-unreachable)

## 9. Files

- `research/source-investigations/teatro-sao-luiz-lisbon-01/`
- `research/source-investigations/ccb-lisbon-01/`
- `research/source-investigations/fama-dalfama-lisbon-01/`
- `research/source-investigations/casa-independente-lisbon-01/`
- `research/source-investigations/museu-do-fado-lisbon-01/`
- `research/source-investigations/hot-five-porto-01/`
- `research/source-investigations/coliseu-ageas-porto-01/`
- `research/source-investigations/mouco-porto-01/`
- `research/source-investigations/casa-das-artes-porto-01/`
- `research/source-investigations/rua-tapas-music-porto-01/`
