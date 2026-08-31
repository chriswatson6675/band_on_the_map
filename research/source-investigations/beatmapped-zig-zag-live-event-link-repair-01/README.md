# BEATMAPPED-ZIG-ZAG-LIVE-EVENT-LINK-REPAIR-01

One-venue, current-live-publication bug fix. Only the current legacy Berlin
publication path (`publish-map-data` → `acquireBerlin()` →
`ingestion/berlin/run.mjs`) was touched. Canonical/city-worker work
(`programme-acquisition-resolver.mjs`, `acquireSource()`,
`DEFAULT_DETAIL_LIMIT`, the publication-bridge investigation) was not opened.

## Evidence manifest

```
evidence/
  probe-listing-hrefs.mjs / listing-hrefs.json     confirms the live listing page's real href pattern
  inspect-raw-jsonld.mjs / raw-jsonld-sample.json   proves the exact root cause (no `url` in JSON-LD)
  verify-fix.mjs / verify-fix-results.json         before/after bounded live validation
```

## 1. Starting main SHA

`8fcabfbf9998e7e9415e434187d1a1f34c547198` — confirmed via `git rev-parse
origin/main`; main had not advanced.

## 2. Branch/worktree

`work/beatmapped-zig-zag-live-event-link-repair-01` at
`.worktrees/zig-zag-live-event-link-repair-01`.

## 3. Current live Zig Zag event count

**Before-state table**, from two independent sources of evidence:

| Evidence source | Event count | event_url quality |
|---|---|---|
| Committed live publication artifact (`data/public/lisbon-porto-map.json`, generated 2026-08-27) | 29 | **100% `null`** — every single listing |
| Fresh live reproduction of the current (pre-fix) collector, 2026-08-31 | 34 | **100% `null`** — every single observation |

The committed artifact is direct evidence of the real, currently-live,
user-visible problem: 29 real Zig Zag events are on the map today, and not
one carries any URL at all — confirmed by reading
`data/public/lisbon-porto-map.json` directly (`countries.Germany.markers`,
filtered to `source_id === "zig-zag-jazz-club-berlin"`). The fresh
2026-08-31 reproduction (34, not 29 — the live programme has simply added a
few more events since 08-27) independently confirms the defect is current
code behaviour, not a one-off stale snapshot — ruling out the brief's §14
stop condition (this is not "already correct, just stale publication").

## 4. Current live URL-quality breakdown

Before fix (both the committed artifact and the fresh reproduction): **34/34
`NO_URL`** (0 `INDIVIDUAL_FIRST_PARTY_EVENT_PAGE`, 0
`FIRST_PARTY_PROGRAMME_PAGE`, 0 `OTHER`).

## 5. Real Zig Zag programme structure

Live-fetched 2026-08-31 (`evidence/probe-listing-hrefs.mjs` →
`listing-hrefs.json`): the listing page
(`https://www.zigzag-jazzclub.berlin/menu-marquee`) links to 35 distinct
`/program-mai/<slug>` paths — `program-mai` is this Squarespace site's own
fixed page slug (not a stale month-specific path despite its name; the
existing `linkPattern` regex in `ingestion/berlin/run.mjs` already matches
it correctly, live, today). Each linked page is a genuine individual event
detail page (confirmed by fetching and inspecting several).

## 6. Proven individual-event URL mechanism

Each `/program-mai/<slug>` detail page embeds its own `application/ld+json`
`Event` block (confirmed live, `evidence/inspect-raw-jsonld.mjs` →
`raw-jsonld-sample.json`) with `name`/`startDate`/`endDate`/`image`/
`location` — genuine, real, first-party structured event data, already
extracted correctly by the existing, unmodified `extractEventNodes()` /
`normaliseJsonLdEvent()`.

## 7. Exact defect

The JSON-LD `Event` node this venue's own Squarespace template emits
**carries no `url` property at all** (confirmed directly:
`raw-jsonld-sample.json`'s `has_url_property: false`). `normaliseJsonLdEvent()`
(`ingestion/json-ld/parse.mjs:307`) sets
`event_url: nonEmptyString(node.url)` — with no `node.url`, this is always
`null`. `ingestion/berlin/run.mjs`'s `collectListDetailJsonLd()` already has
the correct detail URL in hand at this exact point in its loop (it just
fetched it, and confirmed `detailRes.ok`) but never supplied it as a
fallback — even though `toObservation()`
(`ingestion/json-ld/observation-adapter.mjs:222`) already has an existing,
unmodified fallback chain designed for precisely this:
`record.event_url ?? record.ticket_url ?? options.eventDetailUrl ?? null`.
The call site simply never passed `options.eventDetailUrl`. Title, date,
and `source_record_id` (derived independently from the URL's own last path
segment) were never affected — only `event_url` was lost.

## 8. Exact fix

`ingestion/berlin/run.mjs`:

- `collectListDetailJsonLd()` gains one new, opt-in-only parameter,
  `eventUrlFallback = false`. When true, it passes
  `eventDetailUrl: detailUrl` (the SAME already-fetched, already-verified
  detail URL) into the `toObservation()` options, engaging that function's
  own pre-existing fallback. Every existing caller that does not pass this
  parameter is byte-identical to before — the new code path is additive
  and only ever fills an already-`null` `event_url`, never overrides a
  genuinely-published one.
- `collectZigZagJazzClub()` is the only call site changed to pass
  `eventUrlFallback: true`.

No URL is invented, guessed, or derived from a title/slug convention — it is
the exact, already-fetched, already-`200`-verified address this event's own
content came from.

## 9. Files changed

- `ingestion/berlin/run.mjs` (production, +39/-2 lines)
- `tests/zig-zag-event-link-repair.test.mjs` (new, 9 tests)
- `research/source-investigations/beatmapped-zig-zag-live-event-link-repair-01/**` (new, this package's own retained evidence)

No other file touched. `git diff --stat origin/main` confirms exactly these
paths.

## 10. Before/after event counts

34 → 34 (fresh live reproduction, `evidence/verify-fix-results.json`) — the
fix changes zero events' presence, only the `event_url` field.

## 11. Before/after URL-quality counts

| | INDIVIDUAL_FIRST_PARTY_EVENT_PAGE | FIRST_PARTY_PROGRAMME_PAGE | NO_URL | OTHER |
|---|---|---|---|---|
| Before | 0 | 0 | 34 | 0 |
| After | **34** | 0 | 0 | 0 |

100% of currently-published Zig Zag events now carry an
`INDIVIDUAL_FIRST_PARTY_EVENT_PAGE` URL — this venue publishes a detail page
for every one of its events, so 100% is the honest, evidenced ceiling here
(not claimed as a general guarantee for every venue).

## 12. Event title/date regression check

`evidence/verify-fix-results.json`: `title_date_identity_mismatches: 0`
across all 34 before/after pairs (title, start, `source_record_id`,
`source_id`, `venue_name` all compared field-by-field). Confirmed
additionally by 4 dedicated unit tests (`tests/zig-zag-event-link-repair.test.mjs`,
items 3/4/5/6).

## 13. Five real URL spot checks

Live-fetched 2026-08-31, all HTTP 200, all titles/dates match the
originating event:

1. "THE ZIG ZAG JAZZED UP JAM SESSION" (2026-09-01) → `https://www.zigzag-jazzclub.berlin/program-mai/bwnarwjfpss3x6p-c38nm-ntfs4-hcxx7-95y6w` — 200
2. "Tribute to Ella Fitzgerald feat. Lisa Bassenge" (2026-09-02) → `https://www.zigzag-jazzclub.berlin/program-mai/undermyumberella-etggr` — 200
3. "Alexandra Ivanova Trio" (2026-09-03) → `https://www.zigzag-jazzclub.berlin/program-mai/alexivanova256-nckyw` — 200
4. "Alaa Zouiten Quartet & AFICIONADO - Flamenco Moro" (2026-09-04) → `https://www.zigzag-jazzclub.berlin/program-mai/talfulol-w5pah-r3fhx-j9nl7` — 200
5. "Django Reinhardt Orchestra featuring Aurore Voilqué" (2026-09-05) → `https://www.zigzag-jazzclub.berlin/program-mai/hotcluborchestramar26-x9sza-82fep` — 200

## 14. Publication-path verification

Traced and unit-tested (`tests/zig-zag-event-link-repair.test.mjs` item 8,
using the real, unmodified `venues/berlin.json` registry, read-only):
`toObservation()`'s `event_url` survives verbatim through
`projectObservationsToMapMarkers()` (`ingestion/map/projection.mjs:154`,
`event_url: observation.event_url`) and
`projectObservationsToDisplayMarkers()`'s `SINGLE`-listing spread
(`ingestion/map/group-associated-listings.mjs`, `{ kind: "SINGLE",
...listing }`) into the final display listing unchanged. No second URL
field was introduced.

## 15. Tests

`tests/zig-zag-event-link-repair.test.mjs` — 9 new tests, all using the
retained real fixtures (`fixtures/zig-zag-jazz-club-berlin/{program.html,
event-detail.html}`) or the real, unmodified venue registry:

1. discovery step unchanged; 2. `eventDetailUrl` reaches the Observation;
3. title/date unaffected; 4. venue/source identity unaffected; 5. two
distinct events keep distinct URLs; 6. dedup identity (`source_id:
source_record_id`) provably ignores `event_url`; 7. no URL fabricated for a
page with no qualifying JSON-LD node; 8. the URL survives real publication
projection. All 9 pass.

## 16. Full-suite result

**2622 passing, 0 failing** (2613 baseline + 9 new). Zero unexplained
failures.

## 17. Confirmation no other Berlin venue changed

Confirmed by direct diff inspection: `collectKonzerthaus`, `collectLido`,
`collectBFlat`, `collectSo36`, `collectKesselhaus`, `collectHkw`,
`collectVolksbuehne` (the other 7 callers of `collectListDetailJsonLd()`)
appear nowhere in the diff — their call sites are byte-for-byte unchanged,
and the new `eventUrlFallback` parameter defaults to `false`, so their
runtime behaviour is provably identical to before.

## 18. Confirmation canonical/city-worker work untouched

`git diff --stat origin/main` touches only `ingestion/berlin/run.mjs`, the
new test file, and this package's own evidence directory. No file under
`ingestion/programme-acquisition/`, `ingestion/city-worker/`, or any
canonical-experiment evidence directory was read, modified, or touched.

## 19. Confirmation no deployment

No deploy, push, merge, or city-worker job was performed. Changes exist
only in this worktree, uncommitted, awaiting review.

## 20. Candidate SHA / status

Uncommitted (worktree diff only) — ready for the calling session to
commit/review. Branch: `work/beatmapped-zig-zag-live-event-link-repair-01`.

---

ZIG_ZAG_EVENT_LINK_REPAIR_READY
