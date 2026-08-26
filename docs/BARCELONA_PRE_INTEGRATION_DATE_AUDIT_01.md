# Barcelona Pre-Integration Date Audit (BAND-ON-THE-MAP-BARCELONA-PRE-INTEGRATION-DATE-AUDIT-01)

A small, bounded audit of one question, asked before integrating the
Barcelona candidate (`work/barcelona-30-venues-population-01`,
`2942b927cc98f01b69b9ff5875d4fbd19b9163a4`) into `main`:

> Are historical/expired Barcelona events retained only as source/
> Observation history, while the public map correctly displays only
> relevant upcoming events — or are expired events accidentally entering
> the current public-facing map dataset?

**Verdict: a real defect was found and fixed** — not Barcelona-specific,
and not new. Expired listings were already reaching the DEFAULT public
view for Portugal too; Barcelona would have inherited the identical gap
unchanged the moment it is wired into the country selector. This document
records the trace, the fix, and the counts.

## 1. Root cause, traced concretely

The live-run-proof snapshot's earliest date, `2026-03-26`, is a real
Sala Upload record: source `sala-upload-barcelona`, `source_record_id
"21169"`, title "The Clause",
<https://sala-upload.com/conciertos/the-clause-upload-barcelona-2026/>,
`start: { raw: "26 marzo 2026 20:00", date: "2026-03-26", certainty:
"FLOATING_LOCAL" }`. Re-fetched live on 2026-08-26 (run_at
`2026-08-26T10:37:51.632Z`) — Sala Upload's own WordPress `eventos`
custom-post-type REST endpoint (`ingestion/sala-upload/discovery.mjs`)
still serves this now-five-months-past concert's page as a currently
published post; WordPress does not automatically unpublish a past event,
and the collector pulls every `tipo-de-evento-concierto`-tagged record
with no date-based exclusion (by design — see that module's own doc
comment). This is not a parsing bug: the date is genuinely, correctly
extracted; the venue's own site is simply still serving a stale page.

At the same run, Barcelona-wide: **74 of 1,087 accepted display listings
(6.8%) are already-past as of 2026-08-26** — 71 from Sala Upload, 3 from
Sinestesia (a second, independently mixed-programme JSON-LD source with
the same "the source itself still lists a past date" shape). See §4.

## 2. Layer-by-layer semantics (as found, before this package's fix)

| Layer | Historical events retained? | Publicly visible (before fix)? | Rule |
|---|---:|---:|---|
| Raw evidence (`fixtures/`, `research/source-investigations/`) | Yes, always | N/A — not visitor-facing | No date exclusion at acquisition; correct by design (immutable evidence). |
| Observations (`ingestion/observation/contract.mjs`) | Yes, always | N/A | Same — an Observation is a fact about what a source said, never mutated/deleted for being old. |
| Venue resolution (`ingestion/venue/resolver.mjs`) | N/A (resolves identity only) | N/A | Resolves past and future Observations identically — no date awareness, correctly so (resolution is an identity question, not a scheduling one). |
| Publication artifact (`ingestion/map/publication.mjs`, `data/public/lisbon-porto-map.json`) | Yes, always (`buildPortugalMarkers`/`buildSpainMarkers` apply **no date filter** to `display_listings`) | **Yes — every past-dated listing included** | Deliberate: the artifact is meant to carry full history for the client to narrow (see `ingestion/map/date-filter.mjs`'s own doc comment) and for `buildArtistIndex()`'s own separate "upcoming" narrowing of the Artist index only. `--from`/`--to` (Lisbon/Porto only; Barcelona's own collectors do not support it — see `ingestion/barcelona/run.mjs`'s comment) bounds what is *acquired*, not what is *published* — those are two different, easily-conflated concepts, and this audit is the first place that distinction was written down explicitly. |
| Frontend default view (`app/page.tsx`, `components/DiscoveryMap.tsx`) | N/A | **Yes, before this fix** — `fromDate`/`toDate` started `""`; `filterMarkersByDateRange(markers, "", "")` is a documented, tested no-op; the marker pin count (`displayListings.length`) and the venue panel (`displayListings.map(...)`) render every listing with no date awareness of their own. | **This was the defect.** A visitor's first view of the map, before touching any filter, showed expired listings identically to genuine upcoming ones. |

## 3. The fix

Smallest safe, fully generic change — one new pure function
(`ingestion/map/date-filter.mjs`'s `resolveDefaultFromDate`) plus one
`useEffect` in `app/page.tsx` that defaults the (still-empty) `fromDate`
state to the visitor's own today, once, after mount:

- **Generic, not Barcelona-specific**: this is `app/page.tsx`'s own
  page-level default; it narrows whichever country's markers are being
  rendered (currently Portugal; Spain the moment it is wired into the
  country selector — see §5).
- **Preserves all historical evidence**: nothing changes in
  `ingestion/observation/`, `ingestion/venue/`, `ingestion/map/
  publication.mjs`, or the committed artifact's own schema/counts — a
  past listing is exactly as retrievable as before by anyone who
  reads the artifact directly, or by a visitor who deliberately types an
  earlier From date (an explicit override is always respected, exactly
  as `date-filter.mjs` already documented before this fix).
- **`filterMarkersByDateRange`/`listingWithinDateRange` themselves are
  UNCHANGED** — their existing, tested "empty bound == unbounded"
  contract (`tests/date-filter.test.mjs`) stays exactly as documented;
  only the value `app/page.tsx` supplies as its OWN default `From` moved
  from `""` to "today", one layer above that pure module.
- **Client-only, post-mount**: `next build` prerenders `/` as static
  content (confirmed by this package's own `npm run build` output — `○ /
  (Static)`); reading the visitor's wall clock during that render (or in
  a lazy `useState` initializer, which still runs during the prerendered
  pass) would bake a single build-day's date into the static HTML and go
  stale the next day. The `useEffect` — deferred one microtask so the
  `setState` call is a reaction to "mount completed" rather than a
  synchronous render-phase side effect (`react-hooks/set-state-in-effect`)
  — runs only in the browser, after hydration, matching the existing
  `RUNTIME_MAP_DATA_URL` fetch effect's own shape in the same file.

## 4. Barcelona counts (live run, 2026-08-26T10:37:51.632Z, all 23 sources, 31 venues)

| | |
|---|---:|
| Accepted Observations | 1,097 |
| Resolved / unresolved | 1,087 / 10 |
| Display listings | 1,087 |
| — historical (date < 2026-08-26) | 74 (6.8%) |
| — current/future (date >= 2026-08-26) | 1,012 |
| — unknown date | 1 |
| Map markers | 31 |
| Earliest current/future date | 2026-08-26 |
| Latest date | 2027-11-26 |
| Historical listings by venue | Sala Upload: 71 · Sinestesia: 3 |

All 74 historical listings remain fully present in Observations and in
the publication artifact (nothing was deleted); after this fix, none of
them are part of a visitor's default view.

## 5. Scope notes (things this audit found but deliberately did not change)

- **Barcelona is not yet wired into `app/page.tsx` at all.** The country
  `<select>` only offers `Portugal`/`Croatia`; `getMarkersForCountry(country,
  portugalMarkers)` is called with two arguments, so `spainMarkers`
  defaults to `[]` regardless of `country`. No real visitor can reach
  Barcelona data today even though `countries.Spain` already exists in
  the committed artifact (from the Phase 1 candidate, 14 markers, stale
  relative to this Phase 2 candidate's 31). Adding that selector is an
  integration step, not a date-audit fix, and is out of this package's
  bounded scope.
- **The publication-server / runtime-fetch path
  (`ingestion/publication-server/run.mjs`,
  `ingestion/map/runtime-publication.mjs`) serves the raw artifact as
  JSON with no date narrowing of its own** — today its only consumer is
  `app/page.tsx` (now fixed). If a second, non-browser consumer of that
  endpoint is ever built, it would need its own equivalent default —
  flagged here as a follow-up, not fixed, since changing the artifact
  schema itself was judged a larger, riskier change than this audit's
  brief called for.
- KU Barcelona coordinates, the Sala Apolo 107-vs-113 address, and the
  Razzmatazz 2 / Jamboree Sala 2 resolutions were all re-checked and
  found unchanged/correct from the -02 population package — see that
  package's own final report; nothing further was done here.
