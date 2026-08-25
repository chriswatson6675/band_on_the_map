# Events Calendar REST API Collector Family

Reviewed: 2026-08-25
Task: `BOTM-GENERIC-EVENTS-CALENDAR-JSON-API-COLLECTOR-01`

A reusable, source-agnostic acquisition family for WordPress sites running
**The Events Calendar** / **Events Calendar Pro**'s own bundled public REST
API v1 (`/wp-json/tribe/events/v1/`). Adding a new compatible source means
adding one small configuration file — see "Adding another compatible
source" below — never writing another parser/collector.

Code: `ingestion/events-calendar-api/` (generic) + `ingestion/ccb/`
(the one concrete, proven configuration this family currently ships).
Tests: `tests/events-calendar-api-*.test.mjs`, `tests/ccb-events-calendar-proof.test.mjs`.

## Which sites this supports

Any site running The Events Calendar (or Events Calendar Pro) with its own
REST API v1 **publicly reachable and unauthenticated** — proven live
against **Centro Cultural de Belém (CCB)**, `https://www.ccb.pt`, per
`research/source-investigations/ccb-lisbon-01/` (decision:
`READY_FOR_ACTIVATION`).

This package does **not** activate CCB in `sources/lisbon.json` — that
registry entry is unmodified (still `acquisition_method: STABLE_EVENT_PAGE`,
`monitoring_status: READY_FOR_TECHNICAL_PROOF`, a stale pre-investigation
characterisation). Turning this proven capability into an active source is
a separate, later step.

## How to recognise a compatible site

1. The plugin's own rendered HTML advertises the endpoint directly:
   `<link rel="alternate" href=".../wp-json/tribe/events/v1/events/?..." />`
   on any Tribe Events listing page — this is how `ccb-lisbon-01` found it,
   with zero guessing.
2. A plain GET of `{base_url}/wp-json/tribe/events/v1/events/` returns
   `200` with a JSON body shaped `{ events: [...], total, total_pages,
   rest_url, next_rest_url }`.
3. **Compatibility is NOT proven merely by running the same plugin.**
   The plugin's REST API can be, and sometimes is, disabled independently
   of its front-end list/HTML views — see "Reuse assessment" below for two
   concrete examples of this project's own sources that run the same
   plugin but do not (yet, provenly) expose this REST surface.

## Endpoint family

- List: `GET {base_url}/wp-json/tribe/events/v1/events/?categories={slug}&per_page={n}&start_date=...&end_date=...`
- Single event: `GET {base_url}/wp-json/tribe/events/v1/events/{id}` (not
  called by this collector directly — the list endpoint already carries
  every field this collector maps; documented for completeness, and
  proven stable/consistent with the list endpoint in `ccb-lisbon-01`'s own
  evidence).
- Category taxonomy: `GET {base_url}/wp-json/tribe/events/v1/categories`
  (not called by this collector — a config's `category` value is supplied
  by whoever writes the config, from the source's own investigation).

Pagination follows the API's own `next_rest_url` pointer verbatim — never
reconstructed via page-number arithmetic — until it is `null` or a
configured `maxPages` bound is reached.

## Configuration required

`ingestion/events-calendar-api/client.mjs`'s `buildEventsUrl()` accepts:

| Field | Required | Meaning |
|---|---|---|
| `source_id` | required (adapter, not URL-building) | this project's canonical Source id |
| `baseUrl` | yes | e.g. `https://www.ccb.pt` |
| `restPath` | no (defaults to the plugin's own default path) | only for a non-default install |
| `category` | no | the plugin's own category-taxonomy slug filter |
| `perPage` | no | plugin's own `per_page` |
| `startDate` / `endDate` | no | explicit, deterministic date-window bounds (plain strings, passed straight through). **Never computed from `Date.now()` inside this family** — omitting them lets the source's own server apply its own "current and future" default (evidenced live for CCB: the server itself computed a ~2-year forward window with no date parameters sent at all) |
| `maxPages` | no (defaults to 20) | safety bound on pages followed in one run |

See `ingestion/ccb/config.mjs` for the one working example.

## Fields captured

Mapped into the generic Observation contract
(`ingestion/observation/contract.mjs`) by
`ingestion/events-calendar-api/observation-adapter.mjs`:

| Observation field | Source | Notes |
|---|---|---|
| `source_record_id` | `id` (WP post ID) | proven stable/self-referential for CCB (`rest_url` self-reference; empirically stable across independent list/single-event lookups) |
| `title` | `title` | verbatim |
| `description` | `description` | verbatim, source's own (WordPress) HTML, unprocessed |
| `start` / `end` | `start_date`/`utc_start_date`/`timezone` (and the `end_*` equivalents) | see "Date/time certainty" below |
| `venue_name` / `location_text` | `venue.venue` / `venue.address,city,province,zip,country` | per-record, from the API's own structured `venue` object — **not** resolved via a fixed-single-venue table the way, e.g., `ingestion/super-bock-arena/` is, because this API genuinely supplies venue data per record |
| `price_text` | `cost` | verbatim when non-empty. **CCB's own installation never populates this field**, even for real paid concerts — proven in `ccb-lisbon-01`; `price_text` is honestly `null` for CCB, not fabricated or backfilled from a second HTML fetch (see "Known limitations") |
| `event_url` | `url` | verbatim |
| `source_fields.*` | `slug`, `rest_url`, `categories[]`, `tags[]`, `all_day`, `global_id`, `venue.id/phone/url` | preserved for provenance; never promoted to a top-level canonical field |

### Date/time certainty

Following `docs/OBSERVATION_PIPELINE.md`'s certainty model:

- **`UTC_INSTANT`** when the API's own `utc_start_date`/`utc_end_date` is
  present — used directly, not re-derived. For CCB, independently
  cross-validated against every sampled detail page's own explicit-UTC-offset
  schema.org JSON-LD (`ccb-lisbon-01/investigation.json`).
- **`TZID_QUALIFIED_UNRESOLVED`** when only a local date/time plus a named
  `timezone` are present, no UTC field.
- **`FLOATING_LOCAL`** when only a local date/time is present, no
  timezone at all.
- **`TEXT_ONLY`** / **`UNKNOWN`** when nothing parses, matching the
  contract's own fallback rules.

## Known limitations

1. **Price/cost is frequently unpopulated.** CCB's own REST API never
   populates `cost`, even for confirmed paid concerts (ticketing is
   handled by an external system, `ccb.bol.pt`). This collector does
   **not** fetch/scrape the HTML detail page's static price table to
   recover it — that would be a second, HTML-based acquisition mechanism,
   out of scope for a JSON-API family. `price_text` stays honestly `null`
   for such records.
2. **CCB's own HTML permalinks for the first occurrence of a multi-date
   recurring series 302-redirect to a sibling occurrence's page**
   (`ccb-lisbon-01`'s MAJOR blocker). This collector never follows
   `event_url` for anything — it is stored purely as a human-facing
   reference link — so this bug does not affect this collector's own
   correctness at all; it only affects a human clicking that link for an
   affected record.
3. **Category cross-tagging.** A category filter (e.g. CCB's `musica`)
   may still include non-music programming (family/schools/theatre/festival
   entries carrying the same tag alongside genuine concerts). This
   collector does not apply any music/genre judgement — `source_fields.categories`
   preserves every tag the source applied, for a later, separate filtering
   stage to use if needed.
4. **Multi-day / umbrella events are not specially handled.** A record's
   `start`/`end` may genuinely span several days (a festival umbrella
   entry) rather than one performance — this collector maps exactly what
   the source states, with no per-performance decomposition.
5. **This package does not activate any source.** No `sources/*.json`
   entry, `venues/*.json` registry, or scheduler configuration was
   modified.

## Adding another compatible source

1. Confirm the target site's REST API is genuinely public (see "How to
   recognise a compatible site" above) — ideally via a small, governed
   `research/source-investigations/<id>/` investigation, matching this
   project's existing policy (`docs/SOURCE_INVESTIGATION_POLICY.md`).
2. Add one new config file, e.g. `ingestion/<source>/config.mjs`, modelled
   directly on `ingestion/ccb/config.mjs` — `source_id`, `baseUrl`, and
   whatever `category`/`perPage`/`maxPages` the investigation established.
3. Call `fetchAllEvents(config)` and `toObservations(records, config, ...)`
   from `ingestion/events-calendar-api/` — no new parsing/adapter code
   needed unless the new source's API genuinely deviates from the shape
   this family already handles (in which case, extend the generic modules,
   never fork them per-source).
4. Add fixtures under `fixtures/<source>/` (a couple of real, trimmed pages)
   and a small proof test mirroring `tests/ccb-events-calendar-proof.test.mjs`.

## Reuse assessment (read-only; no migration performed)

Two existing sources in this project's registry run the **same underlying
WordPress plugin** (The Events Calendar) as CCB, but **neither is proven
compatible with this REST-API family today**, because neither's existing,
governed acquisition path uses the REST API — each uses a different
technical mechanism this package did not re-investigate or change:

- **Super Bock Arena** (`sources/porto.json`, id `super-bock-arena`,
  `acquisition_method: STABLE_EVENT_PAGE`) — `ingestion/super-bock-arena/discovery.mjs`
  parses the plugin's own **server-rendered HTML list view**
  (`type-tribe_events` cards), not the JSON REST API. No evidence in this
  project currently confirms whether `superbockarena.pt`'s own
  `/wp-json/tribe/events/v1/` surface is even publicly reachable (the
  plugin's REST API can be disabled independently of its front-end views).
- **LAV — Lisboa ao Vivo** (`sources/lisbon.json`, id `lav-lisboa-ao-vivo`,
  `acquisition_method: JSON_LD_EVENT`) — `ingestion/lav/discovery.mjs`
  reads a first-party `<script type="application/ld+json">` schema.org
  Event array embedded directly in the HTML page, not the REST API
  either. Same caveat: REST API reachability is not evidenced.

**Recommendation for a future package (not performed here):** a small,
bounded compatibility check (does `GET {base_url}/wp-json/tribe/events/v1/events/`
return `200` with the expected shape?) for both sites would settle whether
either can be **migrated** onto this family — trivially, if so, since the
generic collector already exists — or must remain on its current, already-proven
acquisition path. This package deliberately does not perform that check or
any migration, per its own bounded scope.
